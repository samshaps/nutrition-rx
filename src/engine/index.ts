/**
 * Engine entry point.
 *
 * Phase 0 stub — WS-A replaces this implementation with the real calculation
 * pipeline (rmr → tdee → targets → macros → energyAvailability → exercise).
 * The signature is the contract every other workstream codes against; do not
 * change it without coordinating.
 *
 * This module must stay pure: no imports from UI or storage.
 */

export * from './types';

import type { EngineInput, PlanResult } from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generatePlan(_input: EngineInput): PlanResult {
  throw new Error('not implemented');
}
