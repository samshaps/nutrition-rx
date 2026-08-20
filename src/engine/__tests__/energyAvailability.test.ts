/**
 * Energy availability — the guardrail. BUILD_PLAN §Engine rules, vector 6.
 */

import { describe, expect, it } from 'vitest';
import { computeEnergyAvailability, eaBand, eaExplanation } from '../energyAvailability';

describe('bands', () => {
  it('splits at 30 and 45 kcal/kg FFM', () => {
    expect(eaBand(29.9)).toBe('low');
    expect(eaBand(30)).toBe('reduced');
    expect(eaBand(44.9)).toBe('reduced');
    expect(eaBand(45)).toBe('optimal');
    expect(eaBand(60)).toBe('optimal');
  });

  it('has a plain-language line for every band', () => {
    for (const band of ['low', 'reduced', 'optimal'] as const) {
      expect(eaExplanation(band).length).toBeGreaterThan(20);
    }
  });
});

describe('computeEnergyAvailability', () => {
  it('is (target - EEE) / FFM, to one decimal', () => {
    const ea = computeEnergyAvailability({ targetKcal: 1750, eee: 214, ffmKg: 50.9 });
    // (1750 - 214) / 50.9 = 30.18
    expect(ea).toEqual({ value: 30.2, band: 'reduced' });
  });

  it('lands in the reduced band for the Priya Shah vector', () => {
    const ea = computeEnergyAvailability({ targetKcal: 1840, eee: 171, ffmKg: 51.2 });
    expect(ea?.value).toBeCloseTo(32.6, 1);
    expect(ea?.band).toBe('reduced');
  });

  it('reports low energy availability rather than hiding it', () => {
    const ea = computeEnergyAvailability({ targetKcal: 1400, eee: 300, ffmKg: 45 });
    // (1400 - 300) / 45 = 24.4
    expect(ea).toEqual({ value: 24.4, band: 'low' });
  });

  it('reaches the optimal band with a generous intake', () => {
    const ea = computeEnergyAvailability({ targetKcal: 3000, eee: 300, ffmKg: 55 });
    expect(ea?.band).toBe('optimal');
  });

  it('degrades to null when FFM is unknown, instead of guessing (vector 6)', () => {
    expect(computeEnergyAvailability({ targetKcal: 2500, eee: 200, ffmKg: null })).toBeNull();
    expect(computeEnergyAvailability({ targetKcal: 2500, eee: 200, ffmKg: 0 })).toBeNull();
  });
});
