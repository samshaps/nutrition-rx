/**
 * Energy availability — the guardrail the PRD calls "the single feature most
 * worth getting right".
 *
 *     EA = (energy intake - exercise energy expenditure) / kg fat-free mass
 *
 * Here "energy intake" is the prescribed (post-clamp) calorie target, so the EA
 * shown on the plan is the EA the patient will actually be living at if they
 * hit the number.
 *
 * Bands (RED-S / Female Athlete Triad literature, applied here as a
 * conservative clinical floor rather than an athlete-specific verdict — see
 * PRD §Risks):
 *   >= 45 kcal/kg FFM  optimal
 *   30 - 45            reduced
 *   <  30              low (LEA)
 *
 * Requires FFM. When body composition is absent the check returns null and the
 * plan degrades to the warning banner (BUILD_PLAN decision 4) — it does not
 * guess.
 */

import type { EaBand, EaResult } from './types';

export const EA_LOW_THRESHOLD = 30;
export const EA_OPTIMAL_THRESHOLD = 45;

export function eaBand(value: number): EaBand {
  if (value < EA_LOW_THRESHOLD) return 'low';
  if (value < EA_OPTIMAL_THRESHOLD) return 'reduced';
  return 'optimal';
}

/** Plain-language, one line, for the provider to read to the patient. */
export function eaExplanation(band: EaBand): string {
  switch (band) {
    case 'low':
      return 'Below 30 kcal/kg fat-free mass: after training is paid for, there is not enough energy left for normal hormonal, bone, and immune function.';
    case 'reduced':
      return 'Between 30 and 45 kcal/kg fat-free mass: enough to protect basic physiology, but below the range associated with optimal recovery and adaptation.';
    case 'optimal':
    default:
      return 'At or above 45 kcal/kg fat-free mass: ample energy remains after training for recovery, hormonal health, and adaptation.';
  }
}

export function computeEnergyAvailability(params: {
  targetKcal: number;
  eee: number;
  ffmKg: number | null;
}): EaResult | null {
  if (params.ffmKg === null || params.ffmKg <= 0) return null;
  const raw = (params.targetKcal - params.eee) / params.ffmKg;
  const value = Math.round(raw * 10) / 10;
  return { value, band: eaBand(value) };
}
