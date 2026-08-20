/**
 * TDEE composition and the MET-based EEE estimate.
 * TDEE = RMR x activity factor + EEE (BUILD_PLAN §TDEE composition).
 */

import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FACTORS,
  classifyExercise,
  computeEee,
  computeTdee,
  DEFAULT_MET,
  metFor,
} from '../tdee';

describe('activity factors', () => {
  it('are the PRD ladder, 1.2 through 1.9', () => {
    expect(ACTIVITY_FACTORS).toEqual({
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    });
  });
});

describe('MET table (fuzzy match on the free-text exercise type)', () => {
  it.each([
    ['Resistance training', 5.0, 'resistance'],
    ['weights', 5.0, 'resistance'],
    ['Lifting (upper/lower split)', 5.0, 'resistance'],
    ['Strength work', 5.0, 'resistance'],
    ['Running', 8.0, 'cardio'],
    ['jogging with the dog', 8.0, 'cardio'],
    ['HIIT class', 8.0, 'cardio'],
    ['Rowing machine', 7.0, 'cardio'],
    ['Basketball (pickup)', 6.5, 'cardio'],
    ['Cycling', 6.0, 'cardio'],
    ['Stationary bike', 6.0, 'cardio'],
    ['Swimming laps', 6.0, 'cardio'],
    ['Walking (brisk)', 3.5, 'cardio'],
    ['Yoga', 2.5, 'other'],
    ['Pilates', 2.5, 'other'],
  ])('maps %s to %f MET', (type, met, kind) => {
    expect(metFor(type)).toBe(met);
    expect(classifyExercise(type).kind).toBe(kind);
  });

  it('falls back to 4.0 MET for an unrecognised string', () => {
    expect(metFor('gardening with the kids')).toBe(DEFAULT_MET);
    expect(metFor('')).toBe(DEFAULT_MET);
  });
});

describe('EEE — gross MET x kg x hours, weekly, averaged over 7 days', () => {
  it('computes the Maya Torres vector: 4 x 60 min resistance at 74.8 kg', () => {
    // 5.0 MET x 74.8 kg x 4 h/wk = 1496 kcal/wk -> 213.7 -> 214 kcal/day
    expect(computeEee([{ type: 'Resistance training', sessionsPerWeek: 4, minutesPerSession: 60 }], 74.8)).toBe(214);
  });

  it('sums multiple modalities (Priya Shah vector)', () => {
    // resistance 5.0 x 82.6 x 1.5 = 619.5; walking 3.5 x 82.6 x 2 = 578.2
    // total 1197.7 /7 = 171.1 -> 171
    expect(
      computeEee(
        [
          { type: 'Resistance training', sessionsPerWeek: 2, minutesPerSession: 45 },
          { type: 'Walking (brisk)', sessionsPerWeek: 3, minutesPerSession: 40 },
        ],
        82.6,
      ),
    ).toBe(171);
  });

  it('uses GROSS MET cost, not net (no resting subtraction)', () => {
    // 1 hour of 8 MET running at 70 kg = 560 kcal gross; net would be 490.
    expect(computeEee([{ type: 'Running', sessionsPerWeek: 7, minutesPerSession: 60 }], 70)).toBe(560);
  });

  it('is zero with no structured exercise, and ignores empty rows', () => {
    expect(computeEee([], 70)).toBe(0);
    expect(computeEee([{ type: 'Running', sessionsPerWeek: 0, minutesPerSession: 45 }], 70)).toBe(0);
    expect(computeEee([{ type: 'Running', sessionsPerWeek: 3, minutesPerSession: 0 }], 70)).toBe(0);
  });
});

describe('computeTdee', () => {
  it('adds EEE on top of RMR x activity factor', () => {
    const result = computeTdee({
      rmrKcal: 1469,
      activityLevel: 'light',
      exercise: [{ type: 'Resistance training', sessionsPerWeek: 4, minutesPerSession: 60 }],
      weightKg: 74.8,
    });
    expect(result.activityFactor).toBe(1.375);
    expect(result.baseline).toBe(2020); // 1469 x 1.375 = 2019.875
    expect(result.eee).toBe(214);
    expect(result.tdee).toBe(2234); // 2019.875 + 214
  });

  it('does not double-count exercise into the activity factor', () => {
    const noExercise = computeTdee({
      rmrKcal: 1600,
      activityLevel: 'moderate',
      exercise: [],
      weightKg: 70,
    });
    expect(noExercise.tdee).toBe(Math.round(1600 * 1.55));
    expect(noExercise.eee).toBe(0);
  });
});
