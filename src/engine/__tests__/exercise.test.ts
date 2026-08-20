/**
 * Exercise prescription — templates by goal, the 4-week ramp from the reported
 * baseline, the Mon-Sun split, and flag-driven notes.
 * PRD §Outputs; BUILD_PLAN §Engine rules.
 */

import { describe, expect, it } from 'vitest';
import {
  baselineCardioMinutes,
  baselineResistanceDays,
  buildRamp,
  buildSplit,
  computeExercisePrescription,
  DAYS,
  templateForGoal,
} from '../exercise';
import type { ClinicalFlag, ExerciseEntry, Goal } from '../types';

const RESISTANCE_4X60: ExerciseEntry[] = [
  { type: 'Resistance training', sessionsPerWeek: 4, minutesPerSession: 60 },
];
const MIXED: ExerciseEntry[] = [
  { type: 'Resistance training', sessionsPerWeek: 2, minutesPerSession: 45 },
  { type: 'Walking (brisk)', sessionsPerWeek: 3, minutesPerSession: 40 },
];

function prescribe(goal: Goal, exercise: ExerciseEntry[] = [], clinicalFlags: ClinicalFlag[] = []) {
  return computeExercisePrescription({ goal, exercise, clinicalFlags });
}

describe('baseline extraction', () => {
  it('counts only cardio modalities toward current cardio minutes', () => {
    expect(baselineCardioMinutes(RESISTANCE_4X60)).toBe(0);
    expect(baselineCardioMinutes(MIXED)).toBe(120);
  });

  it('counts resistance sessions toward current resistance days', () => {
    expect(baselineResistanceDays(RESISTANCE_4X60)).toBe(4);
    expect(baselineResistanceDays(MIXED)).toBe(2);
    expect(baselineResistanceDays([])).toBe(0);
  });
});

describe('templates by goal', () => {
  it('fat loss keeps a patient already inside the 3-4 day band', () => {
    expect(templateForGoal('lose_fat', 4, 0).resistanceDaysPerWeek).toBe(4);
    expect(templateForGoal('lose_fat', 3, 0).resistanceDaysPerWeek).toBe(3);
  });

  it('fat loss moves a patient outside the band into it', () => {
    expect(templateForGoal('lose_fat', 1, 0).resistanceDaysPerWeek).toBe(3);
    expect(templateForGoal('lose_fat', 0, 0).resistanceDaysPerWeek).toBe(3);
    expect(templateForGoal('lose_fat', 6, 0).resistanceDaysPerWeek).toBe(4);
  });

  it('fat loss targets 200 min/wk of cardio, or more if they already do more', () => {
    expect(templateForGoal('lose_fat', 3, 0).cardioMinutesPerWeek).toBe(200);
    expect(templateForGoal('lose_fat', 3, 240).cardioMinutesPerWeek).toBe(240);
    expect(templateForGoal('lose_fat', 3, 400).cardioMinutesPerWeek).toBe(300);
  });

  it('muscle gain is 4 resistance days with cardio held to ~2 sessions', () => {
    const t = templateForGoal('gain_muscle', 1, 0);
    expect(t.resistanceDaysPerWeek).toBe(4);
    expect(t.cardioMinutesPerWeek).toBe(60);
    expect(t.cardioDaysPerWeek).toBe(2);
  });

  it('A1c is 2-3 resistance days and at least 150 min/wk over at least 3 days', () => {
    const t = templateForGoal('improve_a1c', 0, 0);
    expect(t.resistanceDaysPerWeek).toBe(2);
    expect(t.cardioMinutesPerWeek).toBe(150);
    expect(t.cardioDaysPerWeek).toBeGreaterThanOrEqual(3);
    expect(templateForGoal('improve_a1c', 5, 0).resistanceDaysPerWeek).toBe(3);
  });

  it('maintain is the general-health default: 3 resistance days + 150 min', () => {
    const t = templateForGoal('maintain', 0, 0);
    expect(t.resistanceDaysPerWeek).toBe(3);
    expect(t.cardioMinutesPerWeek).toBe(150);
  });
});

describe('the 4-week ramp', () => {
  it('starts at the patient baseline and reaches the target in week 4', () => {
    expect(buildRamp(120, 200)).toEqual([
      { week: 1, cardioMinutes: 120 },
      { week: 2, cardioMinutes: 145 },
      { week: 3, cardioMinutes: 175 },
      { week: 4, cardioMinutes: 200 },
    ]);
  });

  it('starts at 60 min/wk for a patient reporting no cardio at all', () => {
    const ramp = prescribe('lose_fat', RESISTANCE_4X60).rampWeeks;
    expect(ramp[0].cardioMinutes).toBe(60);
    expect(ramp[3].cardioMinutes).toBe(200);
    expect(ramp.map((w) => w.cardioMinutes)).toEqual([60, 105, 155, 200]);
  });

  it('rounds every week to the nearest 5 minutes', () => {
    for (const week of buildRamp(70, 190)) {
      expect(week.cardioMinutes % 5).toBe(0);
    }
  });

  it('tapers rather than ramps when the patient already exceeds the target', () => {
    const ramp = buildRamp(180, 60);
    expect(ramp[0].cardioMinutes).toBe(180);
    expect(ramp[3].cardioMinutes).toBe(60);
    expect(ramp[1].cardioMinutes).toBeLessThan(ramp[0].cardioMinutes);
  });

  it('holds flat when baseline and target already agree', () => {
    expect(buildRamp(60, 60).map((w) => w.cardioMinutes)).toEqual([60, 60, 60, 60]);
  });
});

describe('the weekly split', () => {
  it('covers Mon through Sun exactly once, in order', () => {
    const split = prescribe('lose_fat', RESISTANCE_4X60).split;
    expect(split.map((d) => d.day)).toEqual([...DAYS]);
  });

  it('places the prescribed number of resistance days', () => {
    const split = prescribe('gain_muscle').split;
    expect(split.filter((d) => d.activity.includes('Resistance')).length).toBe(4);
  });

  it('keeps a genuine rest day when the schedule allows one', () => {
    const split = prescribe('gain_muscle').split;
    expect(split.find((d) => d.day === 'Sun')?.activity).toMatch(/Rest/);
  });

  it('puts A1c resistance days on nonconsecutive days', () => {
    const split = prescribe('improve_a1c').split;
    const indices = split
      .map((d, i) => (d.activity.includes('Resistance') ? i : -1))
      .filter((i) => i >= 0);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i] - indices[i - 1]).toBeGreaterThan(1);
    }
  });

  it('never leaves more than 2 consecutive rest days on the A1c template', () => {
    const split = prescribe('improve_a1c').split;
    let run = 0;
    let worst = 0;
    for (const day of split) {
      run = day.activity.startsWith('Rest') ? run + 1 : 0;
      worst = Math.max(worst, run);
    }
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('spreads A1c cardio over at least 3 days', () => {
    const split = prescribe('improve_a1c').split;
    expect(split.filter((d) => d.activity.includes('cardio')).length).toBeGreaterThanOrEqual(3);
  });

  it('splits the weekly cardio target evenly across the cardio days', () => {
    const split = buildSplit({
      resistanceDaysPerWeek: 3,
      cardioDaysPerWeek: 4,
      cardioMinutesPerSession: 50,
      lowImpact: false,
    });
    expect(split.filter((d) => d.activity.includes('50 min moderate cardio')).length).toBe(4);
  });

  it('rewrites cardio in low-impact language when asked', () => {
    const split = buildSplit({
      resistanceDaysPerWeek: 3,
      cardioDaysPerWeek: 3,
      cardioMinutesPerSession: 50,
      lowImpact: true,
    });
    expect(split.some((d) => d.activity.includes('low-impact'))).toBe(true);
    expect(split.some((d) => d.activity.includes('moderate cardio'))).toBe(false);
  });
});

describe('notes', () => {
  it('always explains the progression', () => {
    expect(prescribe('lose_fat', RESISTANCE_4X60).notes.join(' ')).toMatch(/week 1|week 4/i);
  });

  it('carries the A1c spacing and sedentary-interruption rules', () => {
    const notes = prescribe('improve_a1c').notes.join(' ');
    expect(notes).toMatch(/2 consecutive rest days/);
    expect(notes).toMatch(/every 30 minutes/);
  });

  it('caps cardio explicitly on the muscle-gain template', () => {
    expect(prescribe('gain_muscle').notes.join(' ')).toMatch(/10-20 hard sets/);
  });

  it('adds low-impact wording and physician clearance for a cardiac condition', () => {
    const p = prescribe('lose_fat', RESISTANCE_4X60, ['cardiac_condition']);
    expect(p.notes.join(' ')).toMatch(/low-impact/);
    expect(p.notes.join(' ')).toMatch(/physician/);
    expect(p.split.some((d) => d.activity.includes('low-impact'))).toBe(true);
  });

  it('does the same for a mobility limitation', () => {
    const p = prescribe('lose_fat', RESISTANCE_4X60, ['mobility_limitation']);
    expect(p.notes.join(' ')).toMatch(/low-impact/);
    expect(p.notes.join(' ')).toMatch(/physician/);
  });

  it('adds a protein-emphasis note on a GLP-1', () => {
    expect(prescribe('lose_fat', RESISTANCE_4X60, ['glp1']).notes.join(' ')).toMatch(
      /GLP-1.*protein/s,
    );
  });

  it('omits deficit framing and flags the plan when eating-disorder history is on file', () => {
    const withHistory = prescribe('lose_fat', RESISTANCE_4X60, ['eating_disorder_history']);
    const without = prescribe('lose_fat', RESISTANCE_4X60);
    expect(without.notes.join(' ')).toMatch(/0\.5-1\.0% of body weight per week/);
    expect(withHistory.notes.join(' ')).not.toMatch(/0\.5-1\.0% of body weight per week/);
    expect(withHistory.notes.join(' ')).toMatch(/Eating-disorder history/);
  });
});
