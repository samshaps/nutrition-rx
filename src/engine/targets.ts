/**
 * Goal-adjusted energy target, plus the floors that make this a clinical
 * instrument rather than a calorie calculator.
 *
 * GOAL ADJUSTMENTS (PRD §Calculation engine table; BUILD_PLAN §Engine rules)
 *
 *   lose_fat      -15% .. -25% of TDEE, prescribed at the AGGRESSIVE end (-25%)
 *   gain_muscle   +10% .. +20% of TDEE, prescribed at +15%
 *   maintain      TDEE
 *   improve_a1c   -10% .. -20% of TDEE when BMI >= 25, prescribed at -15%;
 *                 otherwise maintain (range collapses to TDEE)
 *
 * Prescribing fat loss at the aggressive end is a deliberate product decision:
 * the floors are the safety mechanism, and a midpoint deficit almost never
 * trips the energy-availability floor while an aggressive one reliably does for
 * the at-risk profile. Surfacing that clamp is the reason the tool exists.
 * (Flagged in BUILD_PLAN for Randee to validate.)
 *
 * FLOORS — applied in this order, never silently:
 *   1. target >= RMR                                    -> 'rmr_floor'
 *   2. target >= 30 x FFM + EEE  (EA >= 30 kcal/kg FFM)  -> 'ea_floor'
 *      (only computable when FFM is known)
 * If both bind, the HIGHER floor wins and its reason is reported.
 *
 * ROUNDING: the prescribed number is rounded to the nearest 10 kcal AFTER
 * clamping. When a floor bound, rounding is done UPWARD to the next 10 so that
 * display rounding can never push the prescription back below the floor it was
 * just raised to.
 */

import type { ClampInfo, ClampReason, Goal, TargetResult } from './types';

export interface GoalAdjustment {
  /** Multiplier applied to TDEE for the prescribed number. */
  prescribed: number;
  /** [lo, hi] multipliers for the displayed range. */
  range: [number, number];
}

export function round10(value: number): number {
  return Math.round(value / 10) * 10;
}

export function ceil10(value: number): number {
  return Math.ceil(value / 10) * 10;
}

/** BMI, kg/m^2. */
export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  if (m <= 0) return 0;
  return weightKg / (m * m);
}

/**
 * The multiplier set for a goal. `improve_a1c` depends on BMI: at BMI < 25 the
 * PRD says maintain, so the deficit and the range both collapse to 1.0.
 */
export function goalAdjustment(goal: Goal, bmiValue: number): GoalAdjustment {
  switch (goal) {
    case 'lose_fat':
      return { prescribed: 0.75, range: [0.75, 0.85] };
    case 'gain_muscle':
      return { prescribed: 1.15, range: [1.1, 1.2] };
    case 'improve_a1c':
      return bmiValue >= 25
        ? { prescribed: 0.85, range: [0.8, 0.9] }
        : { prescribed: 1.0, range: [1.0, 1.0] };
    case 'maintain':
    default:
      return { prescribed: 1.0, range: [1.0, 1.0] };
  }
}

export interface TargetParams {
  tdee: number;
  rmrKcal: number;
  eee: number;
  /** Null when body composition is absent — the EA floor cannot be computed. */
  ffmKg: number | null;
  goal: Goal;
  weightKg: number;
  heightCm: number;
}

/** The EA floor in kcal/day: 30 kcal per kg FFM, plus the cost of training. */
export function eaFloorKcal(ffmKg: number, eee: number): number {
  return 30 * ffmKg + eee;
}

export function computeTarget(params: TargetParams): TargetResult {
  const bmiValue = bmi(params.weightKg, params.heightCm);
  const adjustment = goalAdjustment(params.goal, bmiValue);

  const proposed = params.tdee * adjustment.prescribed;

  // Floors, in order. The RMR floor always applies; the EA floor only when FFM
  // is known. Whichever is higher is the one that actually binds.
  const rmrFloor = params.rmrKcal;
  const eaFloor =
    params.ffmKg !== null && params.ffmKg > 0
      ? eaFloorKcal(params.ffmKg, params.eee)
      : null;

  let floorValue = rmrFloor;
  let floorReason: ClampReason = 'rmr_floor';
  if (eaFloor !== null && eaFloor > floorValue) {
    floorValue = eaFloor;
    floorReason = 'ea_floor';
  }

  const violated = proposed < floorValue;

  // Round to 10 after clamping; upward when a floor bound so the displayed
  // number is never below the floor that produced it.
  const kcal = violated ? ceil10(floorValue) : round10(proposed);

  const clamped: ClampInfo | null = violated
    ? {
        clampedBy: floorReason,
        originalTarget: round10(proposed),
        // Whole kcal: the honest floor, not a rounded-away one.
        floorValue: Math.round(floorValue),
      }
    : null;

  return {
    kcal,
    range: [
      round10(params.tdee * adjustment.range[0]),
      round10(params.tdee * adjustment.range[1]),
    ],
    clamped,
  };
}
