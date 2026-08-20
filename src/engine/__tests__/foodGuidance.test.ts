/**
 * Portion-anchored food guidance. PRD §Outputs: "155 g protein ~ 6 oz chicken
 * + 1 cup Greek yogurt + 2 eggs + 1 scoop whey".
 */

import { describe, expect, it } from 'vitest';
import { buildFoodGuidance, PROTEIN_LIBRARY } from '../foodGuidance';

describe('buildFoodGuidance', () => {
  it('composes to roughly 90% of the protein target', () => {
    for (const target of [90, 105, 120, 140, 150, 155, 180]) {
      const g = buildFoodGuidance(target);
      expect(g.coveragePct).toBeGreaterThanOrEqual(85);
      expect(g.coveragePct).toBeLessThanOrEqual(100);
    }
  });

  it('never exceeds the protein target', () => {
    for (const target of [40, 70, 110, 150, 200]) {
      const g = buildFoodGuidance(target);
      expect(g.totalProteinG).toBeLessThanOrEqual(target);
    }
  });

  it('reports items whose protein sums to the stated total', () => {
    const g = buildFoodGuidance(150);
    expect(g.items.reduce((s, i) => s + i.proteinG, 0)).toBe(g.totalProteinG);
    expect(g.targetProteinG).toBe(150);
  });

  it('gives every item a label, a portion, and a visual anchor', () => {
    for (const item of buildFoodGuidance(150).items) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.portion.length).toBeGreaterThan(0);
      expect(item.emoji.length).toBeGreaterThan(0);
      expect(item.proteinG).toBeGreaterThan(0);
    }
  });

  it('shows a multiplier rather than repeating a food twice', () => {
    const g = buildFoodGuidance(150);
    const labels = g.items.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
    const doubled = g.items.find((i) => i.servings > 1);
    expect(doubled?.portion).toMatch(/^\d+ x /);
  });

  it('never uses more than two servings of one food', () => {
    for (const target of [90, 150, 200, 260]) {
      for (const item of buildFoodGuidance(target).items) {
        expect(item.servings).toBeLessThanOrEqual(2);
      }
    }
  });

  it('is deterministic', () => {
    expect(buildFoodGuidance(150)).toEqual(buildFoodGuidance(150));
  });

  it('handles a zero or nonsensical target without throwing', () => {
    const g = buildFoodGuidance(0);
    expect(g.items).toEqual([]);
    expect(g.totalProteinG).toBe(0);
    expect(g.coveragePct).toBe(0);
    expect(buildFoodGuidance(-50).items).toEqual([]);
  });

  it('always carries the non-protein guidance strings', () => {
    const g = buildFoodGuidance(120);
    expect(g.carbGuidance).toMatch(/carbohydrate/i);
    expect(g.fatGuidance).toMatch(/olive oil|nuts/i);
    expect(g.fiberGuidance).toMatch(/vegetable|fiber/i);
  });

  it('draws only from the published library', () => {
    const known = new Set(PROTEIN_LIBRARY.map((i) => i.label));
    for (const item of buildFoodGuidance(155).items) {
      expect(known.has(item.label)).toBe(true);
    }
  });
});
