/**
 * Macronutrient split at the FINAL (post-clamp) calorie target.
 *
 * PROTEIN (PRD: 1.6-2.2 g/kg, adjusted BW in obesity, capped in renal disease)
 *   lose_fat / gain_muscle .......... 2.0 g/kg
 *   maintain / improve_a1c .......... 1.6 g/kg
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
 *   'renal_protein_cap'. The cap only ever lowers the number.
 *
 * FAT   max(0.6 g/kg actual weight, 20% of calories). Both are floors in the
 *       PRD; the binding one is whichever is larger.
 * CARBS the remainder. If the remainder would go negative, fat is walked back
 *       toward its 0.6 g/kg floor first; if it is still negative at that floor,
 *       carbs are pinned at 0 and 'kcal_too_low_for_macros' is emitted. Protein
 *       is never reduced to make the arithmetic work.
 * FIBER 14 g per 1,000 kcal.
 */

import type { ClinicalFlag, Goal, MacroResult } from './types';

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Machine-readable macro flags. */
export const MACRO_FLAGS = {
  renalProteinCap: 'renal_protein_cap',
  adjustedBodyWeight: 'adjusted_body_weight',
  kcalTooLow: 'kcal_too_low_for_macros',
} as const;

/** g protein per kg of the chosen body-weight basis, by goal. */
export function proteinPerKgForGoal(goal: Goal): number {
  switch (goal) {
    case 'lose_fat':
    case 'gain_muscle':
      return 2.0;
    case 'maintain':
    case 'improve_a1c':
    default:
      return 1.6;
  }
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
  goal: Goal;
  clinicalFlags: ClinicalFlag[];
}

export function computeMacros(params: MacroParams): MacroResult {
  const flags: string[] = [];

  // --- Body-weight basis -------------------------------------------------
  const useAdjusted = params.bmi >= 30;
  const basisKg = useAdjusted
    ? adjustedBodyWeightKg(params.weightKg, params.heightCm)
    : params.weightKg;
  if (useAdjusted) flags.push(MACRO_FLAGS.adjustedBodyWeight);

  // --- Protein -----------------------------------------------------------
  let proteinG = proteinPerKgForGoal(params.goal) * basisKg;

  if (params.clinicalFlags.includes('renal_disease')) {
    const cap = 0.8 * params.weightKg;
    if (cap < proteinG) {
      proteinG = cap;
      flags.push(MACRO_FLAGS.renalProteinCap);
    }
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

  const carbsKcal = params.kcal - proteinRounded * KCAL_PER_G.protein - fatRounded * KCAL_PER_G.fat;
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
    proteinPerKg: Math.round((proteinRounded / basisKg) * 100) / 100,
    flags,
  };
}
