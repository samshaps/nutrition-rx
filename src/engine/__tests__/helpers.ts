/**
 * Test helpers. Not a spec file — vitest only collects `*.test.ts`.
 */

import type { EngineInput, Patient } from '../types';

/** A deliberately ordinary baseline; each test overrides only what it cares about. */
export const BASE_INPUT: EngineInput = {
  sex: 'female',
  ageYears: 40,
  heightCm: 165,
  weightKg: 70,
  activityLevel: 'sedentary',
  exercise: [],
  goal: 'maintain',
  clinicalFlags: [],
};

export function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return { ...BASE_INPUT, ...overrides };
}

/** Whole years between an ISO DOB and a reference date. */
export function ageYearsAt(dob: string, on = '2026-08-20'): number {
  const d = new Date(dob);
  const o = new Date(on);
  let age = o.getFullYear() - d.getFullYear();
  const monthDelta = o.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && o.getDate() < d.getDate())) age -= 1;
  return age;
}

/** The clinical subset of a stored Patient, as the app will build it. */
export function inputFromPatient(patient: Patient, on = '2026-08-20'): EngineInput {
  return {
    sex: patient.sex,
    ageYears: ageYearsAt(patient.dob, on),
    heightCm: patient.heightCm,
    weightKg: patient.weightKg,
    bodyFatPct: patient.bodyFatPct,
    ffmKg: patient.ffmKg,
    measuredRmrKcal: patient.measuredRmrKcal,
    activityLevel: patient.activityLevel,
    exercise: patient.exercise,
    recall: patient.recall,
    goal: patient.goal,
    clinicalFlags: patient.clinicalFlags,
  };
}
