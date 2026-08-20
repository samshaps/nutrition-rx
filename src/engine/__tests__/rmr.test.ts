/**
 * RMR tier ladder — BUILD_PLAN §Test vectors 1-3.
 * Every expectation here is hand-worked from the published equation.
 */

import { describe, expect, it } from 'vitest';
import { computeRmr, katchMcArdle, mifflinStJeor, resolveFfmKg } from '../rmr';

describe('Mifflin-St Jeor (population tier)', () => {
  it('matches the textbook male example: 80 kg, 180 cm, 30 y', () => {
    // 10(80) + 6.25(180) - 5(30) + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(mifflinStJeor({ sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 })).toBe(1780);
  });

  it('matches the textbook female example: 60 kg, 165 cm, 30 y', () => {
    // 10(60) + 6.25(165) - 5(30) - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
    expect(
      mifflinStJeor({ sex: 'female', weightKg: 60, heightCm: 165, ageYears: 30 }),
    ).toBeCloseTo(1320.25, 5);
  });

  it('female is exactly 166 kcal below male at identical anthropometrics', () => {
    const male = mifflinStJeor({ sex: 'male', weightKg: 75, heightCm: 172, ageYears: 45 });
    const female = mifflinStJeor({ sex: 'female', weightKg: 75, heightCm: 172, ageYears: 45 });
    expect(male - female).toBe(166);
  });

  it('is used, and rounded to whole kcal, when no body comp and no measured RMR', () => {
    const rmr = computeRmr({
      sex: 'female',
      ageYears: 30,
      heightCm: 165,
      weightKg: 60,
    });
    expect(rmr).toEqual({ kcal: 1320, source: 'population' });
  });

  it('reproduces the Devon Park seed value (male, 77.6 kg, 177.8 cm, 41 y)', () => {
    // 776 + 1111.25 - 205 + 5 = 1687.25 -> 1687
    const rmr = computeRmr({
      sex: 'male',
      ageYears: 41,
      heightCm: 177.8,
      weightKg: 77.6,
    });
    expect(rmr).toEqual({ kcal: 1687, source: 'population' });
  });
});

describe('Katch-McArdle (ffm tier)', () => {
  it('computes 370 + 21.6 x FFM', () => {
    expect(katchMcArdle(50)).toBe(1450);
    expect(katchMcArdle(50.9)).toBeCloseTo(1469.44, 5);
  });

  it('is selected over Mifflin whenever FFM is present', () => {
    const rmr = computeRmr({
      sex: 'female',
      ageYears: 34,
      heightCm: 167.6,
      weightKg: 74.8,
      ffmKg: 50.9,
    });
    expect(rmr).toEqual({ kcal: 1469, source: 'ffm' });
  });

  it('derives FFM from body fat % when only the percentage is given', () => {
    // 74.8 x (1 - 0.32) = 50.864 -> 370 + 21.6(50.864) = 1468.66 -> 1469
    expect(resolveFfmKg({ weightKg: 74.8, bodyFatPct: 32 })).toBeCloseTo(50.864, 6);
    const rmr = computeRmr({
      sex: 'female',
      ageYears: 34,
      heightCm: 167.6,
      weightKg: 74.8,
      bodyFatPct: 32,
    });
    expect(rmr).toEqual({ kcal: 1469, source: 'ffm' });
  });

  it('prefers an explicit ffmKg over a derived one', () => {
    expect(resolveFfmKg({ weightKg: 74.8, bodyFatPct: 32, ffmKg: 50.9 })).toBe(50.9);
  });

  it('returns null FFM when body composition is absent (no estimation path in v1)', () => {
    expect(resolveFfmKg({ weightKg: 74.8 })).toBeNull();
    expect(resolveFfmKg({ weightKg: 74.8, bodyFatPct: 0 })).toBeNull();
  });
});

describe('measured RMR (measured tier)', () => {
  it('overrides both other tiers', () => {
    const rmr = computeRmr({
      sex: 'female',
      ageYears: 34,
      heightCm: 167.6,
      weightKg: 74.8,
      ffmKg: 50.9,
      measuredRmrKcal: 1580,
    });
    expect(rmr).toEqual({ kcal: 1580, source: 'measured' });
  });

  it('overrides Mifflin when there is no body composition either', () => {
    const rmr = computeRmr({
      sex: 'male',
      ageYears: 41,
      heightCm: 177.8,
      weightKg: 77.6,
      measuredRmrKcal: 1810,
    });
    expect(rmr).toEqual({ kcal: 1810, source: 'measured' });
  });

  it('ignores a non-positive measured value and falls through', () => {
    const rmr = computeRmr({
      sex: 'male',
      ageYears: 41,
      heightCm: 177.8,
      weightKg: 77.6,
      measuredRmrKcal: 0,
    });
    expect(rmr.source).toBe('population');
  });
});
