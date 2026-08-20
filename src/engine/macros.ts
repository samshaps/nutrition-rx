/**
 * Macronutrient split at the FINAL (post-clamp) calorie target.
 *
 * PROTEIN — dosed by TRAINING VOLUME, not by goal.
 *
 *   Randee's practice (spec update, 2026-08-20): "recommendation is 0.8-2 g/kg;
 *   I usually do 1:1 ratio unless they exercise a lot, then 1.5-2 g/kg." So the
 *   dose is driven by how much the patient actually trains, which is also what
 *   the protein-requirement literature keys on:
 *
 *       weekly structured exercise minutes W = SUM(sessions/wk x min/session)
 *
 *         W <  90 min/wk .......... 1.0 g/kg
 *        90 <= W < 180 min/wk ..... 1.5 g/kg
 *       180 <= W ................. 2.0 g/kg
 *
 *   This replaces the earlier flat per-goal dose (2.0 for fat loss / muscle
 *   gain, 1.6 otherwise). Goal no longer enters the protein calculation.
 *
 *   Body-weight basis: actual weight, EXCEPT at BMI >= 30 where dosing protein
 *   on total mass over-prescribes (fat mass is not metabolically demanding).
 *   There we use adjusted body weight:
 *
 *       adjustedBW = idealBW + 0.25 x (actual - idealBW)
 *
 *   IDEAL BODY WEIGHT CHOICE: we use the BMI-25 anchor, idealBW = 25 x h(m)^2,
 *   rather than the Devine formula (45.5/50 kg + 2.3 kg per inch over 5 ft).
 *   Reasons: Devine is a 1970s drug-dosing heuristic built on imperial height
 *   with a known low bias for shorter women, and it would put this product's
 *   protein prescription below the FFM-anchored dose for exactly the patients
 *   who need protein most. The BMI-25 anchor is metric-native, sex-neutral,
 *   continuous, and lands at the top of the healthy BMI band, which is the
 *   conservative direction for a protein target. Flagged as
 *   'adjusted_body_weight' so the plan can say so out loud.
 *
 *   Renal disease caps protein at 0.8 g/kg ACTUAL weight (the cap is a
 *   filtration-load limit, so it is dosed on real mass) and emits
 *   'renal_protein_cap'. The cap only ever lowers the number, and when it binds
 *   it becomes the reported basis — the plan should say "0.8 g/kg actual".
 *
 * FAT   max(0.6 g/kg actual weight, 20% of calories). Both are floors in the
 *       PRD; the binding one is whichever is larger.
 * CARBS the remainder. If the remainder would go negative, fat is walked back
 *       toward its 0.6 g/kg floor first; if it is still negative at that floor,
 *       carbs are pinned at 0 and 'kcal_too_low_for_macros' is emitted. Protein
 *       is never reduced to make the arithmetic work.
 * FIBER 14 g per 1,000 kcal.
 */

import type { ClinicalFlag, ExerciseEntry, MacroResult } from './types';

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Machine-readable macro flags. */
export const MACRO_FLAGS = {
  renalProteinCap: 'renal_protein_cap',
  adjustedBodyWeight: 'adjusted_body_weight',
  kcalTooLow: 'kcal_too_low_for_macros',
  proteinByTrainingVolume: 'protein_dosed_by_training_volume',
} as const;

/** Training-volume thresholds, min/week of structured exercise. */
export const PROTEIN_VOLUME_BANDS = {
  moderate: 90,
  high: 180,
} as const;

/** Total structured exercise minutes per week, across every reported row. */
export function weeklyExerciseMinutes(exercise: ExerciseEntry[]): number {
  return (exercise ?? []).reduce((sum, e) => {
    const sessions = Number.isFinite(e.sessionsPerWeek) ? Math.max(0, e.sessionsPerWeek) : 0;
    const minutes = Number.isFinite(e.minutesPerSession) ? Math.max(0, e.minutesPerSession) : 0;
    return sum + sessions * minutes;
  }, 0);
}

/**
 * g protein per kg of the chosen body-weight basis, from weekly training
 * volume. Applies to every goal.
 */
export function proteinPerKgForTrainingVolume(weeklyMinutes: number): number {
  if (weeklyMinutes >= PROTEIN_VOLUME_BANDS.high) return 2.0;
  if (weeklyMinutes >= PROTEIN_VOLUME_BANDS.moderate) return 1.5;
  return 1.0;
}

/** Ideal body weight at the top of the healthy BMI band: 25 x h(m)^2. */
export function idealBodyWeightKg(heightCm: number): number {
  const m = heightCm / 100;
  return 25 * m * m;
}

/** adjustedBW = idealBW + 0.25 x (actual - idealBW). */
export function adjustedBodyWeightKg(weightKg: number, heightCm: number): number {
  const ideal = idealBodyWeightKg(heightCm);
  return ideal + 0.25 * (weightKg - ideal);
}

export interface MacroParams {
  /** Final, post-clamp prescribed calories. */
  kcal: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  /** Structured exercise minutes per week — drives the protein dose. */
  weeklyExerciseMinutes: number;
  clinicalFlags: ClinicalFlag[];
}

export function computeMacros(params: MacroParams): MacroResult {
  const flags: string[] = [];

  // --- Body-weight basis -------------------------------------------------
  const useAdjusted = params.bmi >= 30;
  let basisKg = useAdjusted
    ? adjustedBodyWeightKg(params.weightKg, params.heightCm)
    : params.weightKg;

  // --- Protein: training volume, then the clinical modifiers -------------
  let perKg = proteinPerKgForTrainingVolume(params.weeklyExerciseMinutes);
  let proteinG = perKg * basisKg;
  let renalCapped = false;

  if (params.clinicalFlags.includes('renal_disease')) {
    const cap = 0.8 * params.weightKg;
    if (cap < proteinG) {
      proteinG = cap;
      // The cap is dosed on actual weight, so that becomes the reported basis.
      basisKg = params.weightKg;
      perKg = 0.8;
      renalCapped = true;
    }
  }

  if (renalCapped) {
    flags.push(MACRO_FLAGS.renalProteinCap);
  } else {
    flags.push(MACRO_FLAGS.proteinByTrainingVolume);
    if (useAdjusted) flags.push(MACRO_FLAGS.adjustedBodyWeight);
  }

  const proteinRounded = Math.round(proteinG);

  // --- Fat ---------------------------------------------------------------
  const fatFloorG = 0.6 * params.weightKg;
  const fatPctFloorG = (0.2 * params.kcal) / KCAL_PER_G.fat;
  let fatG = Math.max(fatFloorG, fatPctFloorG);

  // --- Carbs = remainder -------------------------------------------------
  const kcalAfterProtein = params.kcal - proteinRounded * KCAL_PER_G.protein;
  if (kcalAfterProtein - fatG * KCAL_PER_G.fat < 0) {
    // Walk fat back toward its 0.6 g/kg floor before giving up.
    fatG = Math.max(fatFloorG, kcalAfterProtein / KCAL_PER_G.fat);
  }
  const fatRounded = Math.max(0, Math.round(fatG));

  const carbsKcal =
    params.kcal - proteinRounded * KCAL_PER_G.protein - fatRounded * KCAL_PER_G.fat;
  let carbsRounded = Math.round(carbsKcal / KCAL_PER_G.carbs);
  if (carbsRounded < 0) {
    carbsRounded = 0;
    flags.push(MACRO_FLAGS.kcalTooLow);
  }

  // --- Fiber -------------------------------------------------------------
  const fiberG = Math.round((14 * params.kcal) / 1000);

  return {
    proteinG: proteinRounded,
    carbsG: carbsRounded,
    fatG: fatRounded,
    fiberG,
    proteinPerKg: Math.round(perKg * 100) / 100,
    flags,
  };
}
