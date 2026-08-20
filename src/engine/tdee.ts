/**
 * Total daily energy expenditure, and the structured-exercise component (EEE)
 * that energy availability needs on its own.
 *
 * COMPOSITION (settled in BUILD_PLAN §Engine rules, 2026-08-20):
 *
 *     TDEE = RMR x activityFactor + EEE
 *
 * The activity factor covers occupational / non-exercise daily activity ONLY.
 * Structured, planned exercise is computed separately as EEE and added on top,
 * because energy availability is defined as (intake - EEE) / FFM and therefore
 * needs the exercise cost as a standalone number. Folding exercise into the
 * activity factor would make EA uncomputable.
 *
 * The obvious consequence: a patient who reports "moderate" activity AND four
 * lifting sessions a week gets both. Providers should read the activity factor
 * as "what their job and daily life cost", not "how athletic they are".
 *
 * GROSS vs NET METs
 * -----------------
 * We use GROSS MET cost: kcal = MET x kg x hours, with no subtraction of the
 * resting energy the patient would have burned during that hour anyway. Net
 * cost would be (MET - 1) x kg x hours.
 *
 * Why gross:
 *  - It is how every published MET table and consumer tracker reports exercise
 *    energy, so the numbers match what a provider or patient sees elsewhere.
 *  - It is the convention in the sports-nutrition literature the EA thresholds
 *    (>=45 optimal / 30-45 reduced / <30 low) were derived from, so using gross
 *    here keeps the floor calibrated the way the source research intended.
 *  - It is the conservative direction for the guardrail: a larger EEE means a
 *    higher EA floor, which is the safety behaviour this product exists for.
 * The cost is a modest double-count of resting metabolism during training hours
 * (roughly 1 MET-hour per exercise hour, ~75 kcal/hr for a 75 kg patient).
 *
 * MET TABLE
 * ---------
 * Deliberately small and matched fuzzily against the free-text exercise type
 * the provider typed at intake. Values are rounded compendium-of-physical-
 * activities figures for a moderate, general-population effort:
 *
 *   resistance / weights / lifting / strength .......... 5.0
 *   running / jogging / HIIT / intervals ............... 8.0
 *   rowing ............................................. 7.0
 *   basketball / soccer / tennis / generic "sport" ..... 6.5
 *   cycling / spin / hiking ............................ 6.0
 *   swimming ........................................... 6.0
 *   elliptical / dance / aerobics ...................... 5.0
 *   walking ............................................ 3.5
 *   yoga / pilates / stretching / mobility ............. 2.5
 *   anything unrecognised (default) .................... 4.0
 *
 * The default of 4.0 is a light-moderate guess: high enough to matter in the EA
 * floor, low enough not to invent a large deficit out of an unparsed string.
 */

import type { ActivityLevel, ExerciseEntry } from './types';

/** Occupational / daily-life activity multipliers (PRD: 1.2 -> 1.9). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** How an exercise row is treated by the prescription builder. */
export type ExerciseKind = 'resistance' | 'cardio' | 'other';

interface MetRule {
  /** Lower-case substrings; first rule with any match wins. */
  match: string[];
  met: number;
  kind: ExerciseKind;
}

/**
 * Ordered most-specific-first. `match` entries are substring tests against the
 * lower-cased exercise type string, so "Resistance training (full body)" and
 * "weights" both land on the same rule.
 */
const MET_RULES: MetRule[] = [
  {
    match: ['resistance', 'weight', 'lifting', 'lift', 'strength', 'barbell', 'crossfit'],
    met: 5.0,
    kind: 'resistance',
  },
  { match: ['run', 'jog', 'hiit', 'interval', 'sprint'], met: 8.0, kind: 'cardio' },
  { match: ['row'], met: 7.0, kind: 'cardio' },
  {
    match: ['basketball', 'soccer', 'tennis', 'pickleball', 'sport', 'football', 'hockey'],
    met: 6.5,
    kind: 'cardio',
  },
  { match: ['cycl', 'bike', 'biking', 'spin', 'hike', 'hiking'], met: 6.0, kind: 'cardio' },
  { match: ['swim', 'pool'], met: 6.0, kind: 'cardio' },
  { match: ['elliptical', 'dance', 'aerobic', 'zumba'], met: 5.0, kind: 'cardio' },
  { match: ['walk', 'treadmill walk', 'steps'], met: 3.5, kind: 'cardio' },
  { match: ['yoga', 'pilates', 'stretch', 'mobility', 'tai chi'], met: 2.5, kind: 'other' },
];

/** Fallback for an exercise type we cannot parse. */
export const DEFAULT_MET = 4.0;
export const DEFAULT_KIND: ExerciseKind = 'cardio';

export interface ExerciseClassification {
  met: number;
  kind: ExerciseKind;
}

/** Fuzzy-match a free-text exercise type to a MET value and a kind. */
export function classifyExercise(type: string): ExerciseClassification {
  const t = (type ?? '').toLowerCase();
  for (const rule of MET_RULES) {
    if (rule.match.some((m) => t.includes(m))) {
      return { met: rule.met, kind: rule.kind };
    }
  }
  return { met: DEFAULT_MET, kind: DEFAULT_KIND };
}

/** MET value for a free-text exercise type. */
export function metFor(type: string): number {
  return classifyExercise(type).met;
}

/**
 * Exercise energy expenditure in kcal/DAY, from structured exercise only.
 *
 * Per session: gross MET x bodyWeightKg x hours.
 * Summed across the week, divided by 7 to give a daily average — the plan is a
 * daily prescription, and EA is conventionally expressed per day.
 */
export function computeEee(exercise: ExerciseEntry[], weightKg: number): number {
  const weeklyKcal = (exercise ?? []).reduce((sum, entry) => {
    const sessions = Number.isFinite(entry.sessionsPerWeek) ? entry.sessionsPerWeek : 0;
    const minutes = Number.isFinite(entry.minutesPerSession) ? entry.minutesPerSession : 0;
    if (sessions <= 0 || minutes <= 0) return sum;
    const hoursPerWeek = (sessions * minutes) / 60;
    return sum + metFor(entry.type) * weightKg * hoursPerWeek;
  }, 0);
  return Math.round(weeklyKcal / 7);
}

export interface TdeeResult {
  /** RMR x activity factor, kcal/day — non-exercise expenditure. */
  baseline: number;
  /** Structured-exercise energy expenditure, kcal/day. */
  eee: number;
  /** baseline + eee, kcal/day. */
  tdee: number;
  activityFactor: number;
}

export function computeTdee(params: {
  rmrKcal: number;
  activityLevel: ActivityLevel;
  exercise: ExerciseEntry[];
  weightKg: number;
}): TdeeResult {
  const activityFactor = ACTIVITY_FACTORS[params.activityLevel] ?? ACTIVITY_FACTORS.sedentary;
  const baseline = params.rmrKcal * activityFactor;
  const eee = computeEee(params.exercise, params.weightKg);
  return {
    baseline: Math.round(baseline),
    eee,
    tdee: Math.round(baseline + eee),
    activityFactor,
  };
}
