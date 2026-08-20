import type { Patient } from '../engine/types';

/**
 * Fictional demo patients (BUILD_PLAN.md §Seed patients).
 *
 * All values are metric — storage is always metric, the intake UI does the
 * imperial conversion. IDs and timestamps are hard-coded so seeding is
 * deterministic and idempotent across reloads.
 *
 * Coverage:
 *  1. Maya Torres  — the clamp case. Fat loss + InBody FFM; the −25% target
 *     lands below the 30 kcal/kg FFM energy-availability floor, so the engine
 *     must clamp and report `clampedBy: 'ea_floor'`. This is the demo's money shot.
 *  2. Priya Shah   — fat loss + InBody FFM, EA intended to land in the
 *     "reduced" (30–45) band rather than clamping.
 *  3. Devon Park   — muscle gain, NO body composition. Mifflin-St Jeor path,
 *     EA degrades to the warning banner.
 */

const SEEDED_AT = '2026-08-20T12:00:00.000Z';

export const SEED_PATIENTS: Patient[] = [
  {
    id: 'seed-maya-torres-0001',
    firstName: 'Maya',
    lastName: 'Torres',
    dob: '1992-03-14',
    sex: 'female',
    heightCm: 167.6, // 5'6"
    weightKg: 74.8, // 165 lb
    bodyFatPct: 32,
    ffmKg: 50.9,
    activityLevel: 'light',
    exercise: [{ type: 'Resistance training', sessionsPerWeek: 4, minutesPerSession: 60 }],
    recall: { calories: 1430, proteinG: 68 },
    goal: 'lose_fat',
    clinicalFlags: [],
    isExample: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'seed-priya-shah-0002',
    firstName: 'Priya',
    lastName: 'Shah',
    dob: '1979-06-02',
    sex: 'female',
    heightCm: 162.6, // 5'4"
    weightKg: 82.6, // 182 lb
    bodyFatPct: 38,
    ffmKg: 51.2,
    activityLevel: 'moderate',
    exercise: [
      { type: 'Resistance training', sessionsPerWeek: 2, minutesPerSession: 45 },
      { type: 'Walking (brisk)', sessionsPerWeek: 3, minutesPerSession: 40 },
    ],
    recall: { calories: 1750, proteinG: 72 },
    goal: 'lose_fat',
    clinicalFlags: [],
    isExample: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: 'seed-devon-park-0003',
    firstName: 'Devon',
    lastName: 'Park',
    dob: '1985-01-22',
    sex: 'male',
    heightCm: 177.8, // 5'10"
    weightKg: 77.6, // 171 lb
    // No body composition — scan not available. Mifflin path, EA warning state.
    activityLevel: 'moderate',
    exercise: [
      { type: 'Resistance training', sessionsPerWeek: 3, minutesPerSession: 45 },
      { type: 'Basketball (pickup)', sessionsPerWeek: 1, minutesPerSession: 60 },
    ],
    recall: { calories: 2450, proteinG: 105 },
    goal: 'gain_muscle',
    clinicalFlags: [],
    isExample: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
];

/** Fresh deep copies, so callers can never mutate the module-level seeds. */
export function cloneSeedPatients(): Patient[] {
  return SEED_PATIENTS.map((p) => ({
    ...p,
    exercise: p.exercise.map((e) => ({ ...e })),
    recall: p.recall ? { ...p.recall } : undefined,
    clinicalFlags: [...p.clinicalFlags],
  }));
}
