/**
 * Engine entry point.
 *
 * The single pure pipeline every other workstream codes against:
 *
 *   rmr -> tdee (+ EEE) -> target (+ floors/clamp) -> macros -> EA -> exercise
 *
 * Pure module: no imports from UI or storage, no clock, no randomness. Given
 * the same `EngineInput` it returns the same `PlanResult`, which is what makes
 * the numbers testable independently of how they are displayed (PRD
 * §Calculation engine).
 *
 * `buildFoodGuidance` is exported alongside — it is not part of the
 * `PlanResult` contract (types.ts is owned by Phase 0 and predates it), so the
 * plan document calls it directly with the computed protein target.
 */

export * from './types';

import type { EngineInput, PlanResult } from './types';
import { computeRmr, resolveFfmKg } from './rmr';
import { computeTdee } from './tdee';
import { bmi, computeTarget } from './targets';
import { computeMacros } from './macros';
import { computeEnergyAvailability } from './energyAvailability';
import { computeExercisePrescription } from './exercise';

export {
  computeRmr,
  resolveFfmKg,
  katchMcArdle,
  mifflinStJeor,
} from './rmr';
export {
  ACTIVITY_FACTORS,
  classifyExercise,
  computeEee,
  computeTdee,
  metFor,
} from './tdee';
export {
  bmi,
  ceil10,
  computeTarget,
  eaFloorKcal,
  goalAdjustment,
  round10,
} from './targets';
export {
  adjustedBodyWeightKg,
  computeMacros,
  idealBodyWeightKg,
  MACRO_FLAGS,
  proteinPerKgForGoal,
} from './macros';
export {
  computeEnergyAvailability,
  eaBand,
  eaExplanation,
  EA_LOW_THRESHOLD,
  EA_OPTIMAL_THRESHOLD,
} from './energyAvailability';
export {
  baselineCardioMinutes,
  baselineResistanceDays,
  buildRamp,
  buildSplit,
  computeExercisePrescription,
  DAYS,
  templateForGoal,
} from './exercise';
export { buildFoodGuidance, PROTEIN_LIBRARY } from './foodGuidance';
export type {
  FoodGuidance,
  FoodGuidanceItem,
  FoodItem,
} from './foodGuidance';
export type { ExerciseKind, TdeeResult } from './tdee';
export type { GoalAdjustment, TargetParams } from './targets';
export type { MacroParams } from './macros';
export type { GoalTemplate } from './exercise';

export function generatePlan(input: EngineInput): PlanResult {
  const rmr = computeRmr(input);
  const ffmKg = resolveFfmKg(input);

  const { eee, tdee } = computeTdee({
    rmrKcal: rmr.kcal,
    activityLevel: input.activityLevel,
    exercise: input.exercise,
    weightKg: input.weightKg,
  });

  const target = computeTarget({
    tdee,
    rmrKcal: rmr.kcal,
    eee,
    ffmKg,
    goal: input.goal,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
  });

  const macros = computeMacros({
    kcal: target.kcal,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    bmi: bmi(input.weightKg, input.heightCm),
    goal: input.goal,
    clinicalFlags: input.clinicalFlags ?? [],
  });

  const ea = computeEnergyAvailability({
    targetKcal: target.kcal,
    eee,
    ffmKg,
  });

  const exercise = computeExercisePrescription({
    goal: input.goal,
    exercise: input.exercise,
    clinicalFlags: input.clinicalFlags ?? [],
  });

  return { rmr, eee, tdee, target, macros, ea, exercise };
}
