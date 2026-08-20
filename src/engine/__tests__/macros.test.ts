/**
 * Macros at the final target — protein dosed by training volume (Randee's
 * practice: "0.8-2 g/kg; I usually do 1:1 unless they exercise a lot, then
 * 1.5-2"), adjusted body weight in obesity, renal cap, fat floors, carb
 * remainder, fiber. BUILD_PLAN §Engine rules and §Test vectors 5.
 */

import { describe, expect, it } from 'vitest';
import {
  adjustedBodyWeightKg,
  computeMacros,
  idealBodyWeightKg,
  MACRO_FLAGS,
  proteinPerKgForTrainingVolume,
  weeklyExerciseMinutes,
} from '../macros';
import type { MacroParams } from '../macros';
import { bmi } from '../targets';

function macros(overrides: Partial<MacroParams> = {}) {
  const base: MacroParams = {
    kcal: 2000,
    weightKg: 70,
    heightCm: 170,
    bmi: bmi(70, 170),
    weeklyExerciseMinutes: 0,
    clinicalFlags: [],
  };
  return computeMacros({ ...base, ...overrides });
}

describe('weekly training volume', () => {
  it('sums sessions x minutes across every reported row', () => {
    expect(
      weeklyExerciseMinutes([
        { type: 'Resistance training', sessionsPerWeek: 2, minutesPerSession: 45 },
        { type: 'Walking (brisk)', sessionsPerWeek: 3, minutesPerSession: 40 },
      ]),
    ).toBe(210);
    expect(weeklyExerciseMinutes([])).toBe(0);
  });
});

describe('protein dose by training volume', () => {
  it.each([
    [0, 1.0],
    [89, 1.0],
    [90, 1.5],
    [179, 1.5],
    [180, 2.0],
    [240, 2.0],
  ])('%i min/wk -> %f g/kg', (minutes, perKg) => {
    expect(proteinPerKgForTrainingVolume(minutes)).toBe(perKg);
  });

  it('doses a barely-active patient at 1.0 g/kg', () => {
    const m = macros({ weeklyExerciseMinutes: 60 });
    expect(m.proteinG).toBe(70);
    expect(m.proteinPerKg).toBe(1);
    expect(m.flags).toContain(MACRO_FLAGS.proteinByTrainingVolume);
  });

  it('doses a moderately active patient at 1.5 g/kg', () => {
    const m = macros({ weeklyExerciseMinutes: 120 });
    expect(m.proteinG).toBe(105);
    expect(m.proteinPerKg).toBe(1.5);
  });

  it('doses a high-volume patient at 2.0 g/kg regardless of goal', () => {
    const m = macros({ weeklyExerciseMinutes: 240 });
    expect(m.proteinG).toBe(140);
    expect(m.proteinPerKg).toBe(2);
  });
});

describe('body-weight basis', () => {
  it('uses the BMI-25 anchor for ideal body weight', () => {
    expect(idealBodyWeightKg(162.6)).toBeCloseTo(66.1, 1);
    expect(adjustedBodyWeightKg(82.6, 162.6)).toBeCloseTo(70.22, 2);
  });

  it('uses actual weight below BMI 30', () => {
    const m = macros({ weightKg: 74.8, heightCm: 167.6, bmi: bmi(74.8, 167.6), weeklyExerciseMinutes: 240, kcal: 1750 });
    expect(m.proteinG).toBe(150); // 2.0 x 74.8
    expect(m.flags).not.toContain(MACRO_FLAGS.adjustedBodyWeight);
  });

  it('switches to adjusted body weight at BMI >= 30 and flags it', () => {
    const m = macros({
      kcal: 1840,
      weightKg: 82.6,
      heightCm: 162.6,
      bmi: bmi(82.6, 162.6),
      weeklyExerciseMinutes: 210,
    });
    expect(m.proteinG).toBe(140); // 2.0 x 70.22
    expect(m.flags).toContain(MACRO_FLAGS.adjustedBodyWeight);
  });
});

describe('renal protein cap (vector 5)', () => {
  it('caps at 0.8 g/kg of ACTUAL weight and emits the flag', () => {
    const m = macros({
      weightKg: 80,
      heightCm: 175,
      bmi: bmi(80, 175),
      weeklyExerciseMinutes: 240,
      clinicalFlags: ['renal_disease'],
    });
    expect(m.proteinG).toBe(64); // 0.8 x 80, not 2.0 x 80
    expect(m.proteinPerKg).toBe(0.8);
    expect(m.flags).toContain(MACRO_FLAGS.renalProteinCap);
    expect(m.flags).not.toContain(MACRO_FLAGS.proteinByTrainingVolume);
  });

  it('overrides the adjusted-body-weight path when it binds', () => {
    const m = macros({
      kcal: 1840,
      weightKg: 82.6,
      heightCm: 162.6,
      bmi: bmi(82.6, 162.6),
      weeklyExerciseMinutes: 210,
      clinicalFlags: ['renal_disease'],
    });
    expect(m.proteinG).toBe(66); // 0.8 x 82.6 = 66.08
    expect(m.flags).toContain(MACRO_FLAGS.renalProteinCap);
    expect(m.flags).not.toContain(MACRO_FLAGS.adjustedBodyWeight);
  });

  it('never raises protein — a below-cap dose is left alone', () => {
    // BMI 36.7 with low training volume: adjusted BW dosing already sits under
    // the 0.8 g/kg-of-actual ceiling, so the cap does not bind.
    const m = macros({
      kcal: 1900,
      weightKg: 100,
      heightCm: 165,
      bmi: bmi(100, 165),
      weeklyExerciseMinutes: 60,
      clinicalFlags: ['renal_disease'],
    });
    expect(m.proteinG).toBe(76);
    expect(m.flags).not.toContain(MACRO_FLAGS.renalProteinCap);
    expect(m.flags).toContain(MACRO_FLAGS.adjustedBodyWeight);
  });
});

describe('fat', () => {
  it('takes the 0.6 g/kg floor when it is the binding one', () => {
    const m = macros({ kcal: 1750, weightKg: 74.8, heightCm: 167.6, bmi: bmi(74.8, 167.6), weeklyExerciseMinutes: 240 });
    // 0.6 x 74.8 = 44.88 vs 20% of 1750 / 9 = 38.9
    expect(m.fatG).toBe(45);
  });

  it('takes the 20%-of-calories floor when it is the binding one', () => {
    const m = macros({ kcal: 3230, weightKg: 77.6, heightCm: 177.8, bmi: bmi(77.6, 177.8), weeklyExerciseMinutes: 195 });
    // 0.6 x 77.6 = 46.56 vs 20% of 3230 / 9 = 71.8
    expect(m.fatG).toBe(72);
  });
});

describe('carbs and fiber', () => {
  it('gives carbs the remainder of the calorie budget', () => {
    const m = macros({ kcal: 1750, weightKg: 74.8, heightCm: 167.6, bmi: bmi(74.8, 167.6), weeklyExerciseMinutes: 240 });
    // 1750 - (150 x 4) - (45 x 9) = 745 kcal -> 186 g
    expect(m.carbsG).toBe(186);
    expect(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9).toBeCloseTo(1750, -1);
  });

  it('pins carbs at zero and flags when the calorie target cannot carry the macros', () => {
    const m = macros({ kcal: 800, weightKg: 100, heightCm: 200, bmi: bmi(100, 200), weeklyExerciseMinutes: 240 });
    expect(m.proteinG).toBe(200);
    expect(m.carbsG).toBe(0);
    expect(m.flags).toContain(MACRO_FLAGS.kcalTooLow);
  });

  it('sets fiber at 14 g per 1,000 kcal', () => {
    expect(macros({ kcal: 1000 }).fiberG).toBe(14);
    expect(macros({ kcal: 1750 }).fiberG).toBe(25);
    expect(macros({ kcal: 3230 }).fiberG).toBe(45);
  });

  it('returns whole grams everywhere', () => {
    const m = macros({ kcal: 2137, weightKg: 71.3, weeklyExerciseMinutes: 133 });
    for (const value of [m.proteinG, m.carbsG, m.fatG, m.fiberG]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
