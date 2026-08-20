/**
 * Shared types for Nutrition Rx.
 *
 * The `Patient` model is the storage + engine-input contract from BUILD_PLAN.md
 * ("Data model"). Body composition is scan-derived or absent — there are no
 * tape-measure / Navy-method fields in v1 (BUILD_PLAN decision 4).
 *
 * This file is owned by Phase 0 and consumed by every workstream. Prefer
 * additive changes; coordinate before changing an existing field.
 */

export type Goal = 'lose_fat' | 'gain_muscle' | 'maintain' | 'improve_a1c';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type ClinicalFlag =
  | 'renal_disease'
  | 'cardiac_condition'
  | 'pregnancy_lactation'
  | 'eating_disorder_history'
  | 'mobility_limitation'
  | 'glp1';

export type Sex = 'male' | 'female';

/** One row of structured (planned, repeating) exercise as reported at intake. */
export interface ExerciseEntry {
  type: string;
  sessionsPerWeek: number;
  minutesPerSession: number;
}

/** Optional 24-hour recall. Feeds the current-vs-target gap display only. */
export interface Recall {
  calories?: number;
  proteinG?: number;
}

export interface Patient {
  id: string; // crypto.randomUUID()
  firstName: string;
  lastName: string;
  dob: string; // ISO date
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number; // OR ffmKg — store one, derive the other; scan-derived only
  ffmKg?: number;
  measuredRmrKcal?: number; // indirect calorimetry override
  activityLevel: ActivityLevel;
  exercise: ExerciseEntry[];
  recall?: Recall;
  goal: Goal;
  clinicalFlags: ClinicalFlag[];
  isExample?: boolean; // seeded demo patients
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Engine input
 * ------------------------------------------------------------------ */

/**
 * The clinical subset of `Patient` the engine actually reads. Deliberately
 * free of identity, storage, and audit fields so the engine stays pure and
 * testable. `ageYears` is derived from `dob` at the call site.
 */
export interface EngineInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number;
  ffmKg?: number;
  measuredRmrKcal?: number;
  activityLevel: ActivityLevel;
  exercise: ExerciseEntry[];
  recall?: Recall;
  goal: Goal;
  clinicalFlags: ClinicalFlag[];
}

/* ------------------------------------------------------------------ *
 * Engine result
 * ------------------------------------------------------------------ */

/** Which RMR tier produced the number — rendered as a trust badge on the plan. */
export type RmrSource = 'measured' | 'ffm' | 'population';

export interface RmrResult {
  kcal: number;
  source: RmrSource;
}

/** Which floor clamped the target, when one did. */
export type ClampReason = 'rmr_floor' | 'ea_floor';

export interface ClampInfo {
  clampedBy: ClampReason;
  /** The goal-derived target before clamping. */
  originalTarget: number;
  /** The floor value the target was raised to. */
  floorValue: number;
}

export interface TargetResult {
  /** Prescribed kcal/day (post-clamp). */
  kcal: number;
  /** Goal-adjustment range as [lo, hi] kcal/day. */
  range: [number, number];
  /** Null when no floor was violated. */
  clamped: null | ClampInfo;
}

export interface MacroResult {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  /** Protein grams per kg of the body-weight basis actually used. */
  proteinPerKg: number;
  /** Machine-readable notes, e.g. renal protein cap applied. */
  flags: string[];
}

export type EaBand = 'low' | 'reduced' | 'optimal';

export interface EaResult {
  /** kcal per kg FFM per day. */
  value: number;
  band: EaBand;
}

export interface RampWeek {
  week: number;
  cardioMinutes: number;
}

export interface SplitDay {
  day: string;
  activity: string;
}

export interface ExercisePrescription {
  resistanceDaysPerWeek: number;
  cardioMinutesPerWeek: number;
  /** ~4-week progression from the patient's reported baseline. */
  rampWeeks: RampWeek[];
  split: SplitDay[];
  notes: string[];
}

export interface PlanResult {
  rmr: RmrResult;
  /** Exercise energy expenditure, kcal/day, from structured exercise only. */
  eee: number;
  /** Total daily energy expenditure, kcal/day. */
  tdee: number;
  target: TargetResult;
  macros: MacroResult;
  /** Null when FFM is unknown — the plan shows the degraded warning banner. */
  ea: null | EaResult;
  exercise: ExercisePrescription;
}
