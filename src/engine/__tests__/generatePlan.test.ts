/**
 * End-to-end pipeline, including the three seeded demo patients.
 *
 * The seed expectations here are the acceptance criteria from BUILD_PLAN
 * §Seed patients: Maya must clamp on the EA floor (the demo's money shot),
 * Priya must land in the reduced band without clamping, Devon must fall back to
 * Mifflin with the EA check degraded.
 */

import { describe, expect, it } from 'vitest';
import { generatePlan } from '../index';
import { SEED_PATIENTS } from '../../store/seeds';
import { input, inputFromPatient } from './helpers';

const [maya, priya, devon] = SEED_PATIENTS;

describe('Maya Torres — the clamp case', () => {
  const plan = generatePlan(inputFromPatient(maya));

  it('uses the Katch-McArdle tier from the InBody FFM', () => {
    expect(plan.rmr).toEqual({ kcal: 1469, source: 'ffm' });
  });

  it('computes EEE and TDEE from 4 x 60 min of lifting at light daily activity', () => {
    expect(plan.eee).toBe(214);
    expect(plan.tdee).toBe(2234);
  });

  it('CLAMPS the -25% target on the energy-availability floor', () => {
    expect(plan.target.clamped).not.toBeNull();
    expect(plan.target.clamped?.clampedBy).toBe('ea_floor');
    expect(plan.target.clamped?.originalTarget).toBe(1680);
    expect(plan.target.clamped?.floorValue).toBe(1741);
    expect(plan.target.kcal).toBe(1750);
  });

  it('shows the un-clamped goal range alongside the prescribed number', () => {
    expect(plan.target.range).toEqual([1680, 1900]);
  });

  it('lands at or above an EA of 30 once clamped', () => {
    expect(plan.ea?.value).toBeGreaterThanOrEqual(30);
    expect(plan.ea).toEqual({ value: 30.2, band: 'reduced' });
  });

  it('prescribes macros against the clamped target', () => {
    expect(plan.macros).toMatchObject({
      proteinG: 150, // 240 min/wk of training -> 2.0 g/kg x 74.8
      fatG: 45,
      carbsG: 186,
      fiberG: 25,
      proteinPerKg: 2,
    });
  });

  it('keeps her at 4 resistance days and ramps cardio from zero', () => {
    expect(plan.exercise.resistanceDaysPerWeek).toBe(4);
    expect(plan.exercise.rampWeeks.map((w) => w.cardioMinutes)).toEqual([60, 105, 155, 200]);
  });
});

describe('Priya Shah — reduced EA without a clamp', () => {
  const plan = generatePlan(inputFromPatient(priya));

  it('uses the FFM tier', () => {
    expect(plan.rmr).toEqual({ kcal: 1476, source: 'ffm' });
  });

  it('does not clamp — the deficit clears both floors', () => {
    expect(plan.target.clamped).toBeNull();
    expect(plan.target.kcal).toBe(1840);
  });

  it('reports reduced energy availability', () => {
    expect(plan.ea?.band).toBe('reduced');
    expect(plan.ea?.value).toBeCloseTo(32.6, 1);
  });

  it('doses protein on adjusted body weight at BMI 31.2', () => {
    expect(plan.macros.proteinG).toBe(140);
    expect(plan.macros.flags).toContain('adjusted_body_weight');
  });

  it('raises her from 2 to 3 resistance days and ramps cardio from her 120 min baseline', () => {
    expect(plan.exercise.resistanceDaysPerWeek).toBe(3);
    expect(plan.exercise.rampWeeks[0].cardioMinutes).toBe(120);
    expect(plan.exercise.rampWeeks[3].cardioMinutes).toBe(200);
  });
});

describe('Devon Park — no body composition (vector 6)', () => {
  const plan = generatePlan(inputFromPatient(devon));

  it('falls back to the Mifflin-St Jeor population tier', () => {
    expect(plan.rmr).toEqual({ kcal: 1687, source: 'population' });
  });

  it('degrades the EA check instead of guessing at FFM', () => {
    expect(plan.ea).toBeNull();
  });

  it('prescribes a surplus, unclamped', () => {
    expect(plan.tdee).toBe(2812);
    expect(plan.target.kcal).toBe(3230);
    expect(plan.target.range).toEqual([3090, 3370]);
    expect(plan.target.clamped).toBeNull();
    expect(plan.target.kcal).toBeGreaterThan(plan.tdee);
  });

  it('uses the muscle-gain exercise template', () => {
    expect(plan.exercise.resistanceDaysPerWeek).toBe(4);
    expect(plan.exercise.cardioMinutesPerWeek).toBe(60);
  });
});

describe('pipeline invariants', () => {
  it('never prescribes below RMR, for any goal', () => {
    for (const goal of ['lose_fat', 'gain_muscle', 'maintain', 'improve_a1c'] as const) {
      const plan = generatePlan(
        input({ goal, weightKg: 58, heightCm: 172, ffmKg: 44, activityLevel: 'sedentary' }),
      );
      expect(plan.target.kcal).toBeGreaterThanOrEqual(plan.rmr.kcal);
    }
  });

  it('never prescribes an EA below 30 when FFM is known', () => {
    const plan = generatePlan(
      input({
        goal: 'lose_fat',
        weightKg: 62,
        heightCm: 168,
        ffmKg: 48,
        activityLevel: 'light',
        exercise: [{ type: 'Running', sessionsPerWeek: 5, minutesPerSession: 60 }],
      }),
    );
    expect(plan.ea).not.toBeNull();
    expect(plan.ea!.value).toBeGreaterThanOrEqual(30);
    expect(plan.target.clamped?.clampedBy).toBe('ea_floor');
  });

  it('lets a measured RMR override the InBody path end to end (vector 3)', () => {
    const withMeasured = generatePlan(
      inputFromPatient({ ...maya, measuredRmrKcal: 1620 }),
    );
    expect(withMeasured.rmr).toEqual({ kcal: 1620, source: 'measured' });
    expect(withMeasured.tdee).toBeGreaterThan(generatePlan(inputFromPatient(maya)).tdee);
  });

  it('caps protein and flags it under a renal-disease flag (vector 5)', () => {
    const plan = generatePlan(inputFromPatient({ ...maya, clinicalFlags: ['renal_disease'] }));
    expect(plan.macros.proteinG).toBe(60); // 0.8 x 74.8 = 59.84
    expect(plan.macros.flags).toContain('renal_protein_cap');
  });

  it('treats improve_a1c at BMI < 25 as maintenance calories (vector 7)', () => {
    const lean = input({
      goal: 'improve_a1c',
      weightKg: 66,
      heightCm: 175,
      activityLevel: 'light',
    });
    const plan = generatePlan(lean);
    const maintain = generatePlan({ ...lean, goal: 'maintain' });
    expect(plan.target.kcal).toBe(maintain.target.kcal);
    expect(plan.target.clamped).toBeNull();
    expect(plan.exercise.notes.join(' ')).toMatch(/2 consecutive rest days/);
  });

  it('cuts calories for improve_a1c once BMI is 25 or above', () => {
    const plan = generatePlan(
      input({ goal: 'improve_a1c', weightKg: 88, heightCm: 172, activityLevel: 'light' }),
    );
    expect(plan.target.kcal).toBeLessThan(plan.tdee);
    expect(plan.target.range[0]).toBeLessThan(plan.target.range[1]);
  });

  it('prescribes maintenance at TDEE when nothing binds', () => {
    const plan = generatePlan(input({ goal: 'maintain', activityLevel: 'moderate' }));
    expect(Math.abs(plan.target.kcal - plan.tdee)).toBeLessThanOrEqual(5);
    expect(plan.target.clamped).toBeNull();
  });

  it('is pure — the same input always produces the same plan', () => {
    const i = inputFromPatient(priya);
    expect(generatePlan(i)).toEqual(generatePlan(i));
  });

  it('returns every field of the PlanResult contract', () => {
    const plan = generatePlan(inputFromPatient(maya));
    expect(Object.keys(plan).sort()).toEqual(
      ['ea', 'eee', 'exercise', 'macros', 'rmr', 'target', 'tdee'].sort(),
    );
    expect(plan.exercise.split).toHaveLength(7);
    expect(plan.exercise.rampWeeks).toHaveLength(4);
    expect(plan.exercise.notes.length).toBeGreaterThan(0);
  });
});
