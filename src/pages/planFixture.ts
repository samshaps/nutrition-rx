/**
 * Plan-document fixtures and the portion-equivalents library.
 *
 * Two things live here, both temporary scaffolding for the plan page:
 *
 *  1. `PLAN_FIXTURE` — a hand-worked `PlanResult` for the canonical seed
 *     patient (Maya Torres, the EA-clamp case). PlanDocument renders it only
 *     when `generatePlan()` throws or returns something that does not match the
 *     `PlanResult` shape, i.e. while WS-A's engine is still landing.
 *
 *  2. `buildPortionTiles()` — the protein portion-equivalents used by the food
 *     guidance section, scaled from a small local library. If/when the engine
 *     exports a food-guidance helper, this is replaced by that call.
 *
 * Both are marked with `// INTEGRATION: remove fallback` at their use sites in
 * PlanDocument.tsx, and this whole module goes away with them.
 */

import type { PlanResult } from '../engine/types';

/* ------------------------------------------------------------------ *
 * 1. Fixture PlanResult — Maya Torres (seed-maya-torres-0001)
 * ------------------------------------------------------------------ *
 * Hand-worked from BUILD_PLAN.md §Engine rules:
 *   RMR   Katch-McArdle  370 + 21.6 x 50.9 kg FFM        = 1469 kcal
 *   EEE   4 x 60 min resistance, ~5 MET x 74.8 kg / 7 d  =  214 kcal/day
 *   TDEE  1469 x 1.375 (light) + 214                     = 2230 kcal
 *   Goal  lose_fat, -15%..-25% of TDEE                   = 1900 .. 1680
 *   Floor EA 30 kcal/kg FFM -> 30 x 50.9 + 214 = 1741    -> 1750 kcal
 *   EA    (1750 - 214) / 50.9                            = 30.2 (reduced)
 *   Macro protein 2.0 g/kg x 74.8 = 150 g; fat 0.8 g/kg = 60 g (31% kcal);
 *         carbs = (1750 - 600 - 540) / 4 = 153 g; fiber = 14 g/1000 kcal = 25 g
 */
export const PLAN_FIXTURE: PlanResult = {
  rmr: { kcal: 1469, source: 'ffm' },
  eee: 214,
  tdee: 2230,
  target: {
    kcal: 1750,
    range: [1680, 1900],
    clamped: {
      clampedBy: 'ea_floor',
      originalTarget: 1680,
      floorValue: 1750,
    },
  },
  macros: {
    proteinG: 150,
    carbsG: 153,
    fatG: 60,
    fiberG: 25,
    proteinPerKg: 2.0,
    flags: [],
  },
  ea: { value: 30.2, band: 'reduced' },
  exercise: {
    resistanceDaysPerWeek: 4,
    cardioMinutesPerWeek: 210,
    rampWeeks: [
      { week: 1, cardioMinutes: 90 },
      { week: 2, cardioMinutes: 130 },
      { week: 3, cardioMinutes: 170 },
      { week: 4, cardioMinutes: 210 },
    ],
    split: [
      { day: 'Mon', activity: 'Lift' },
      { day: 'Tue', activity: 'Brisk walk 30 min' },
      { day: 'Wed', activity: 'Lift' },
      { day: 'Thu', activity: 'Brisk walk 30 min' },
      { day: 'Fri', activity: 'Lift' },
      { day: 'Sat', activity: 'Lift + walk 30 min' },
      { day: 'Sun', activity: 'Rest' },
    ],
    notes: [
      'Keep the lifting program you are already doing — it is what protects lean mass during a deficit.',
      'Move days around to fit your week, but leave at least one day between hard sessions for the same muscles.',
      'Brisk walking counts as moderate cardio: you should be able to talk, but not sing.',
    ],
  },
};

/* ------------------------------------------------------------------ *
 * 2. Portion-equivalents library
 * ------------------------------------------------------------------ */

/** One portion tile in the "what N g of protein looks like" row. */
export interface PortionTile {
  /** Icon key — PlanDocument maps this to an inline SVG glyph. */
  icon: 'chicken' | 'yogurt' | 'eggs' | 'whey' | 'salmon';
  name: string;
  /** Human portion, e.g. "6 oz, cooked". */
  portion: string;
  /** Protein in that portion, whole grams. */
  proteinG: number;
  /** Cumulative protein through this tile. */
  running: number;
}

interface Anchor {
  icon: PortionTile['icon'];
  name: string;
  /** Baseline serving count for a 150 g/day protein target. */
  baseUnits: number;
  /** Protein grams per serving unit. */
  gPerUnit: number;
  /** Rounding step for servings (0.5 = half-scoops / half-cups). */
  step: number;
  /** Renders the portion label for a scaled serving count. */
  label: (units: number) => string;
}

/** The five everyday anchors from the approved mock, at a 150 g/day baseline. */
const ANCHORS: Anchor[] = [
  {
    icon: 'chicken',
    name: 'Chicken breast',
    baseUnits: 6, // oz
    gPerUnit: 8.7,
    step: 1,
    label: (u) => `${u} oz, cooked`,
  },
  {
    icon: 'yogurt',
    name: 'Greek yogurt',
    baseUnits: 1, // cups
    gPerUnit: 20,
    step: 0.5,
    label: (u) => `${formatUnits(u)} cup${u === 1 ? '' : 's'}, plain`,
  },
  {
    icon: 'eggs',
    name: 'Eggs',
    baseUnits: 2, // whole eggs
    gPerUnit: 6,
    step: 1,
    label: (u) => `${u} whole`,
  },
  {
    icon: 'whey',
    name: 'Whey protein',
    baseUnits: 1, // scoops
    gPerUnit: 25,
    step: 0.5,
    label: (u) => `${formatUnits(u)} scoop${u === 1 ? '' : 's'} in milk`,
  },
  {
    icon: 'salmon',
    name: 'Salmon',
    baseUnits: 4, // oz
    gPerUnit: 7,
    step: 1,
    label: (u) => `${u} oz fillet`,
  },
];

function formatUnits(u: number): string {
  return Number.isInteger(u) ? String(u) : u.toFixed(1);
}

/** Baseline protein target the ANCHORS table is written against. */
const BASELINE_PROTEIN_G = 150;

/**
 * Scale the anchor library to a protein target. Deliberately lands a little
 * short of target — the tiles cover the named foods, and the copy underneath
 * says the rest arrives from ordinary meals.
 */
export function buildPortionTiles(proteinG: number): PortionTile[] {
  const target = Number.isFinite(proteinG) && proteinG > 0 ? proteinG : BASELINE_PROTEIN_G;
  const factor = target / BASELINE_PROTEIN_G;

  let running = 0;
  return ANCHORS.map((a) => {
    const scaled = a.baseUnits * factor;
    const units = Math.max(a.step, Math.round(scaled / a.step) * a.step);
    const rounded = Math.round(units * 10) / 10;
    const grams = Math.round(rounded * a.gPerUnit);
    running += grams;
    return {
      icon: a.icon,
      name: a.name,
      portion: a.label(rounded),
      proteinG: grams,
      running,
    };
  });
}
