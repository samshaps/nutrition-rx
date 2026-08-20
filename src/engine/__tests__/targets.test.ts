/**
 * Goal targets, the displayed range, and the floors that clamp them.
 * BUILD_PLAN §Goal targets and §Test vectors 4 and 7.
 */

import { describe, expect, it } from 'vitest';
import { bmi, ceil10, computeTarget, eaFloorKcal, goalAdjustment, round10 } from '../targets';
import type { TargetParams } from '../targets';

const NO_FLOOR_PRESSURE: TargetParams = {
  tdee: 3000,
  rmrKcal: 1500,
  eee: 0,
  ffmKg: null,
  goal: 'maintain',
  weightKg: 70,
  heightCm: 170,
};

function target(overrides: Partial<TargetParams> = {}) {
  return computeTarget({ ...NO_FLOOR_PRESSURE, ...overrides });
}

describe('rounding helpers', () => {
  it('round10 goes to the nearest 10, ceil10 always upward', () => {
    expect(round10(1675.5)).toBe(1680);
    expect(round10(1741)).toBe(1740);
    expect(ceil10(1741)).toBe(1750);
    expect(ceil10(1740)).toBe(1740);
  });
});

describe('bmi', () => {
  it('is kg / m^2', () => {
    expect(bmi(82.6, 162.6)).toBeCloseTo(31.24, 2);
    expect(bmi(74.8, 167.6)).toBeCloseTo(26.63, 2);
    expect(bmi(77.6, 177.8)).toBeCloseTo(24.55, 2);
  });
});

describe('goal adjustments', () => {
  it('prescribes fat loss at the aggressive end and shows the full range', () => {
    expect(goalAdjustment('lose_fat', 27)).toEqual({ prescribed: 0.75, range: [0.75, 0.85] });
  });

  it('prescribes muscle gain at +15% within a +10..+20% range', () => {
    expect(goalAdjustment('gain_muscle', 24)).toEqual({ prescribed: 1.15, range: [1.1, 1.2] });
  });

  it('maintains at TDEE with a collapsed range', () => {
    expect(goalAdjustment('maintain', 24)).toEqual({ prescribed: 1, range: [1, 1] });
  });

  it('treats improve_a1c as -15% only when BMI >= 25', () => {
    expect(goalAdjustment('improve_a1c', 25)).toEqual({ prescribed: 0.85, range: [0.8, 0.9] });
    expect(goalAdjustment('improve_a1c', 24.9)).toEqual({ prescribed: 1, range: [1, 1] });
  });
});

describe('unclamped targets', () => {
  it('lose_fat lands at -25% of TDEE with a -25..-15% range', () => {
    const t = target({ goal: 'lose_fat' });
    expect(t.kcal).toBe(2250);
    expect(t.range).toEqual([2250, 2550]);
    expect(t.clamped).toBeNull();
  });

  it('gain_muscle lands at +15% with a +10..+20% range', () => {
    const t = target({ goal: 'gain_muscle' });
    expect(t.kcal).toBe(3450);
    expect(t.range).toEqual([3300, 3600]);
    expect(t.clamped).toBeNull();
  });

  it('maintain lands at TDEE', () => {
    const t = target({ tdee: 2459 });
    expect(t.kcal).toBe(2460);
    expect(t.range).toEqual([2460, 2460]);
  });

  it('improve_a1c at BMI >= 25 lands at -15%', () => {
    const t = target({ goal: 'improve_a1c', weightKg: 90, heightCm: 170 });
    expect(t.kcal).toBe(2550);
    expect(t.range).toEqual([2400, 2700]);
  });

  it('improve_a1c at BMI < 25 lands at maintenance calories (vector 7)', () => {
    const t = target({ goal: 'improve_a1c', weightKg: 65, heightCm: 175 });
    expect(t.kcal).toBe(3000);
    expect(t.range).toEqual([3000, 3000]);
    expect(t.clamped).toBeNull();
  });

  it('rounds the prescribed number to the nearest 10', () => {
    expect(target({ tdee: 2233 }).kcal).toBe(2230);
    expect(target({ tdee: 2236 }).kcal).toBe(2240);
  });
});

describe('the RMR floor', () => {
  it('clamps a target that falls below RMR and names the reason', () => {
    const t = target({ tdee: 1800, rmrKcal: 1500, goal: 'lose_fat' });
    expect(t.kcal).toBe(1500);
    expect(t.clamped).toEqual({
      clampedBy: 'rmr_floor',
      originalTarget: 1350,
      floorValue: 1500,
    });
  });

  it('rounds a clamped target UPWARD so display rounding cannot re-breach the floor', () => {
    const t = target({ tdee: 1800, rmrKcal: 1501, goal: 'lose_fat' });
    expect(t.kcal).toBe(1510);
    expect(t.clamped?.floorValue).toBe(1501);
  });
});

describe('the energy-availability floor', () => {
  it('is 30 kcal/kg FFM plus the cost of training', () => {
    expect(eaFloorKcal(50.9, 214)).toBeCloseTo(1741, 5);
  });

  it('clamps the PRD canonical case and names ea_floor (vector 4)', () => {
    // Maya Torres: TDEE 2234, -25% = 1675.5, EA floor 30(50.9) + 214 = 1741.
    const t = target({
      tdee: 2234,
      rmrKcal: 1469,
      eee: 214,
      ffmKg: 50.9,
      goal: 'lose_fat',
      weightKg: 74.8,
      heightCm: 167.6,
    });
    expect(t.clamped).toEqual({
      clampedBy: 'ea_floor',
      originalTarget: 1680,
      floorValue: 1741,
    });
    expect(t.kcal).toBe(1750);
    // The prescribed number must sit at or above the floor it was raised to.
    expect(t.kcal).toBeGreaterThanOrEqual(t.clamped!.floorValue);
  });

  it('does not apply when FFM is unknown (vector 6)', () => {
    const t = target({ tdee: 2234, rmrKcal: 1469, eee: 214, ffmKg: null, goal: 'lose_fat' });
    expect(t.kcal).toBe(1680);
    expect(t.clamped).toBeNull();
  });

  it('does not clamp when the deficit still clears the floor (Priya Shah vector)', () => {
    const t = target({
      tdee: 2459,
      rmrKcal: 1476,
      eee: 171,
      ffmKg: 51.2,
      goal: 'lose_fat',
      weightKg: 82.6,
      heightCm: 162.6,
    });
    expect(t.kcal).toBe(1840);
    expect(t.clamped).toBeNull();
  });
});

describe('when both floors bind', () => {
  it('uses the EA floor when it is the higher one', () => {
    const t = target({ tdee: 2000, rmrKcal: 1400, eee: 300, ffmKg: 55, goal: 'lose_fat' });
    // proposed 1500; rmr floor 1400; ea floor 30(55) + 300 = 1950
    expect(t.clamped).toEqual({
      clampedBy: 'ea_floor',
      originalTarget: 1500,
      floorValue: 1950,
    });
    expect(t.kcal).toBe(1950);
  });

  it('uses the RMR floor when it is the higher one', () => {
    const t = target({ tdee: 2400, rmrKcal: 1900, eee: 100, ffmKg: 40, goal: 'lose_fat' });
    // proposed 1800; rmr floor 1900; ea floor 30(40) + 100 = 1300
    expect(t.clamped).toEqual({
      clampedBy: 'rmr_floor',
      originalTarget: 1800,
      floorValue: 1900,
    });
    expect(t.kcal).toBe(1900);
  });
});
