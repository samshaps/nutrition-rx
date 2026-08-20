/**
 * Resting metabolic rate — the three-tier ladder from the PRD
 * (§Calculation engine) and BUILD_PLAN §Engine rules.
 *
 * Tier order, best-anchored first:
 *   1. `measured`   — indirect calorimetry, entered directly. Ground truth.
 *   2. `ffm`        — Katch-McArdle from measured fat-free mass:
 *                     RMR = 370 + 21.6 x FFM(kg). This is the InBody / DEXA path.
 *   3. `population` — Mifflin-St Jeor:
 *                     RMR = 10W + 6.25H - 5A + 5 (male) / - 161 (female).
 *
 * The tier is carried on the result so the plan can render a trust badge; the
 * PRD is explicit that a provider must be able to see at a glance how much to
 * trust the number (an InBody does NOT measure RMR, it estimates it from FFM).
 *
 * Body composition is scan-derived or absent (BUILD_PLAN decision 4) — there is
 * no estimation path here. Pure module: no UI, no storage.
 */

import type { EngineInput, RmrResult } from './types';

/** Rounding for a displayed kcal/day metabolic rate: whole kcal. */
function roundKcal(value: number): number {
  return Math.round(value);
}

/**
 * Fat-free mass in kg, if it is knowable from the input.
 *
 * Prefers an explicit `ffmKg` (what an InBody/DEXA report actually states) and
 * otherwise derives it from body fat percentage: FFM = weight x (1 - BF%/100).
 * Returns `null` when body composition is absent — which is what degrades the
 * energy-availability check to a warning banner downstream.
 */
export function resolveFfmKg(input: {
  weightKg: number;
  bodyFatPct?: number;
  ffmKg?: number;
}): number | null {
  if (typeof input.ffmKg === 'number' && input.ffmKg > 0) return input.ffmKg;
  if (
    typeof input.bodyFatPct === 'number' &&
    input.bodyFatPct > 0 &&
    input.bodyFatPct < 100 &&
    input.weightKg > 0
  ) {
    return input.weightKg * (1 - input.bodyFatPct / 100);
  }
  return null;
}

/** Katch-McArdle: 370 + 21.6 x FFM(kg). Unrounded. */
export function katchMcArdle(ffmKg: number): number {
  return 370 + 21.6 * ffmKg;
}

/** Mifflin-St Jeor: 10W + 6.25H - 5A + 5 (male) / - 161 (female). Unrounded. */
export function mifflinStJeor(params: {
  sex: 'male' | 'female';
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base =
    10 * params.weightKg + 6.25 * params.heightCm - 5 * params.ageYears;
  return params.sex === 'male' ? base + 5 : base - 161;
}

/**
 * Pick the best available tier and compute RMR in kcal/day (rounded to whole
 * kcal — this value is displayed and is the input to every downstream step).
 */
export function computeRmr(
  input: Pick<
    EngineInput,
    | 'sex'
    | 'ageYears'
    | 'heightCm'
    | 'weightKg'
    | 'bodyFatPct'
    | 'ffmKg'
    | 'measuredRmrKcal'
  >,
): RmrResult {
  if (typeof input.measuredRmrKcal === 'number' && input.measuredRmrKcal > 0) {
    return { kcal: roundKcal(input.measuredRmrKcal), source: 'measured' };
  }

  const ffmKg = resolveFfmKg(input);
  if (ffmKg !== null) {
    return { kcal: roundKcal(katchMcArdle(ffmKg)), source: 'ffm' };
  }

  return {
    kcal: roundKcal(
      mifflinStJeor({
        sex: input.sex,
        weightKg: input.weightKg,
        heightCm: input.heightCm,
        ageYears: input.ageYears,
      }),
    ),
    source: 'population',
  };
}
