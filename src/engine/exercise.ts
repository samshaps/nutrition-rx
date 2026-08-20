/**
 * Weekly exercise prescription — template by goal, ramped from the patient's
 * reported baseline (PRD §Outputs: "Nobody goes from zero to 250 min/wk").
 *
 * TEMPLATES (PRD §Outputs, anchored to published guidance)
 *   lose_fat     resistance 3-4x/wk (keep the patient's current count if it is
 *                already 3-4), aerobic 200-300 min/wk moderate -> target 200
 *   gain_muscle  resistance 4x/wk, 10-20 hard sets per muscle group per week,
 *                cardio limited to ~2 sessions -> target 60 min/wk
 *   improve_a1c  resistance 2-3x/wk on NONCONSECUTIVE days, >=150 min/wk
 *                aerobic spread over >=3 days with no more than 2 consecutive
 *                rest days, plus interrupting sedentary time every 30 min
 *   maintain     general-health default: resistance 3x/wk + 150 min/wk aerobic
 *
 * RAMP: week 1 starts at max(current reported cardio, 60) min/wk and moves
 * linearly to the goal target by week 4, rounded to the nearest 5 minutes. When
 * the patient already exceeds the target (a muscle-gain patient doing a lot of
 * cardio) the same interpolation produces a taper, which is the correct
 * prescription.
 *
 * SPLIT: a Mon-Sun grid. Resistance days use fixed patterns that keep the A1c
 * "nonconsecutive" rule true by construction; cardio fills rest days first
 * (leaving Sunday as a genuine rest day where possible) and only then doubles
 * up onto resistance days.
 *
 * FLAGS: `cardiac_condition` / `mobility_limitation` rewrite cardio in
 * low-impact language and add a physician-clearance note; `glp1` adds a
 * protein-emphasis note; `eating_disorder_history` suppresses the
 * calorie-deficit framing note and flags the plan for provider attention.
 */

import type {
  ClinicalFlag,
  ExerciseEntry,
  ExercisePrescription,
  Goal,
  RampWeek,
  SplitDay,
} from './types';
import { classifyExercise } from './tdee';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Fixed resistance-day patterns, indexed by days per week. */
const RESISTANCE_PATTERNS: Record<number, string[]> = {
  0: [],
  1: ['Mon'],
  2: ['Mon', 'Thu'],
  3: ['Mon', 'Wed', 'Fri'],
  4: ['Mon', 'Tue', 'Thu', 'Fri'],
  5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
  6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  7: [...DAYS],
};

function round5(value: number): number {
  return Math.round(value / 5) * 5;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Current cardio volume, min/week, from the reported structured exercise. */
export function baselineCardioMinutes(exercise: ExerciseEntry[]): number {
  return (exercise ?? []).reduce((sum, e) => {
    if (classifyExercise(e.type).kind !== 'cardio') return sum;
    const sessions = Number.isFinite(e.sessionsPerWeek) ? e.sessionsPerWeek : 0;
    const minutes = Number.isFinite(e.minutesPerSession) ? e.minutesPerSession : 0;
    return sum + Math.max(0, sessions) * Math.max(0, minutes);
  }, 0);
}

/** Current resistance sessions per week, from the reported structured exercise. */
export function baselineResistanceDays(exercise: ExerciseEntry[]): number {
  const days = (exercise ?? []).reduce((sum, e) => {
    if (classifyExercise(e.type).kind !== 'resistance') return sum;
    return sum + Math.max(0, Number.isFinite(e.sessionsPerWeek) ? e.sessionsPerWeek : 0);
  }, 0);
  return clamp(Math.round(days), 0, 7);
}

export interface GoalTemplate {
  resistanceDaysPerWeek: number;
  cardioMinutesPerWeek: number;
  cardioDaysPerWeek: number;
}

export function templateForGoal(
  goal: Goal,
  currentResistanceDays: number,
  currentCardioMinutes: number,
): GoalTemplate {
  switch (goal) {
    case 'lose_fat':
      return {
        // 3-4x/wk; if they are already inside the band, don't move them.
        resistanceDaysPerWeek:
          currentResistanceDays >= 3 && currentResistanceDays <= 4
            ? currentResistanceDays
            : currentResistanceDays > 4
              ? 4
              : 3,
        // 200-300 min/wk. Prescribe 200 unless they already do more.
        cardioMinutesPerWeek:
          currentCardioMinutes >= 200 ? round5(Math.min(currentCardioMinutes, 300)) : 200,
        cardioDaysPerWeek: 4,
      };
    case 'gain_muscle':
      return {
        resistanceDaysPerWeek: 4,
        cardioMinutesPerWeek: 60, // ~2 sessions, per the PRD's cardio limit
        cardioDaysPerWeek: 2,
      };
    case 'improve_a1c':
      return {
        // 2-3x/wk on nonconsecutive days.
        resistanceDaysPerWeek:
          currentResistanceDays >= 2 ? Math.min(currentResistanceDays, 3) : 2,
        cardioMinutesPerWeek:
          currentCardioMinutes >= 150 ? round5(Math.min(currentCardioMinutes, 300)) : 150,
        // >=3 days; 5 keeps consecutive rest days to at most one.
        cardioDaysPerWeek: 5,
      };
    case 'maintain':
    default:
      return {
        resistanceDaysPerWeek: 3,
        cardioMinutesPerWeek:
          currentCardioMinutes >= 150 ? round5(Math.min(currentCardioMinutes, 300)) : 150,
        cardioDaysPerWeek: 3,
      };
  }
}

/** 4-week linear ramp from the baseline week-1 volume to the goal target. */
export function buildRamp(week1Minutes: number, targetMinutes: number): RampWeek[] {
  return [1, 2, 3, 4].map((week) => ({
    week,
    cardioMinutes: round5(
      week1Minutes + ((targetMinutes - week1Minutes) * (week - 1)) / 3,
    ),
  }));
}

/**
 * Mon-Sun grid. Cardio takes rest days first (holding Sunday back as a real
 * rest day when it can) and only stacks onto resistance days if it must.
 */
export function buildSplit(params: {
  resistanceDaysPerWeek: number;
  cardioDaysPerWeek: number;
  cardioMinutesPerSession: number;
  lowImpact: boolean;
}): SplitDay[] {
  const resistanceDays = new Set(
    RESISTANCE_PATTERNS[clamp(params.resistanceDaysPerWeek, 0, 7)] ?? [],
  );

  const restDays = DAYS.filter((d) => !resistanceDays.has(d));
  const reserveSunday = restDays.includes('Sun') && restDays.length > 1;
  const preferred = restDays.filter((d) => !(reserveSunday && d === 'Sun'));
  const fallback = DAYS.filter((d) => resistanceDays.has(d));
  const candidates = [...preferred, ...fallback, ...(reserveSunday ? ['Sun'] : [])];

  const cardioDays = new Set(
    candidates.slice(0, clamp(params.cardioDaysPerWeek, 0, 7)),
  );

  const cardioLabel = params.lowImpact
    ? `${params.cardioMinutesPerSession} min low-impact cardio (walk, stationary bike, or pool)`
    : `${params.cardioMinutesPerSession} min moderate cardio`;

  return DAYS.map((day) => {
    const r = resistanceDays.has(day);
    const c = cardioDays.has(day) && params.cardioMinutesPerSession > 0;
    let activity: string;
    if (r && c) activity = `Resistance training + ${cardioLabel}`;
    else if (r) activity = 'Resistance training';
    else if (c) activity = cardioLabel[0].toUpperCase() + cardioLabel.slice(1);
    else activity = 'Rest / light movement';
    return { day, activity };
  });
}

export interface ExerciseParams {
  goal: Goal;
  exercise: ExerciseEntry[];
  clinicalFlags: ClinicalFlag[];
}

export function computeExercisePrescription(
  params: ExerciseParams,
): ExercisePrescription {
  const flags = params.clinicalFlags ?? [];
  const lowImpact =
    flags.includes('cardiac_condition') || flags.includes('mobility_limitation');

  const currentCardio = baselineCardioMinutes(params.exercise);
  const currentResistance = baselineResistanceDays(params.exercise);
  const template = templateForGoal(params.goal, currentResistance, currentCardio);

  const week1 = round5(Math.max(currentCardio, 60));
  const rampWeeks = buildRamp(week1, template.cardioMinutesPerWeek);

  const cardioMinutesPerSession =
    template.cardioDaysPerWeek > 0
      ? round5(template.cardioMinutesPerWeek / template.cardioDaysPerWeek)
      : 0;

  const split = buildSplit({
    resistanceDaysPerWeek: template.resistanceDaysPerWeek,
    cardioDaysPerWeek: template.cardioDaysPerWeek,
    cardioMinutesPerSession,
    lowImpact,
  });

  const notes: string[] = [];

  // --- Progression -------------------------------------------------------
  if (template.cardioMinutesPerWeek > week1) {
    const step = Math.round((template.cardioMinutesPerWeek - week1) / 3);
    notes.push(
      `Cardio ramps from ${week1} min/week in week 1 to ${template.cardioMinutesPerWeek} min/week by week 4 — about ${step} more minutes each week. Repeat a week instead of advancing if the last step felt hard.`,
    );
  } else if (template.cardioMinutesPerWeek < week1) {
    notes.push(
      `Cardio tapers from ${week1} min/week to ${template.cardioMinutesPerWeek} min/week over 4 weeks so it stops competing with recovery from lifting.`,
    );
  } else {
    notes.push(
      `Cardio holds at ${template.cardioMinutesPerWeek} min/week, which matches the reported current volume — the work this month is consistency, not more minutes.`,
    );
  }

  // --- Resistance --------------------------------------------------------
  switch (params.goal) {
    case 'lose_fat':
      notes.push(
        `Resistance training ${template.resistanceDaysPerWeek} days/week, full-body or upper/lower, 2-3 hard sets per movement. This is what protects lean mass while calories are reduced.`,
      );
      break;
    case 'gain_muscle':
      notes.push(
        'Resistance training 4 days/week; accumulate 10-20 hard sets per muscle group per week and add load or reps whenever a set feels easy.',
      );
      notes.push(
        'Cardio is deliberately capped at about 2 sessions so it does not compete with recovery from lifting.',
      );
      break;
    case 'improve_a1c':
      notes.push(
        `Resistance training ${template.resistanceDaysPerWeek} days/week on nonconsecutive days.`,
      );
      notes.push(
        'Spread cardio over at least 3 days with no more than 2 consecutive rest days — a session improves insulin sensitivity for roughly 24-48 hours, so the spacing is the point.',
      );
      notes.push(
        'Interrupt sitting every 30 minutes with 2-3 minutes of standing or walking.',
      );
      break;
    case 'maintain':
    default:
      notes.push(
        'Resistance training 3 days/week plus 150 min/week of moderate aerobic activity — the general-health minimum.',
      );
      break;
  }

  // --- Rate-of-change framing (suppressed for eating-disorder history) ----
  const edHistory = flags.includes('eating_disorder_history');
  if (!edHistory) {
    if (params.goal === 'lose_fat') {
      notes.push(
        'Expected rate of change: 0.5-1.0% of body weight per week. Faster than that is mostly lean mass and water.',
      );
    } else if (params.goal === 'gain_muscle') {
      notes.push(
        'Expected rate of change: 0.25-0.5% of body weight per week. Faster than that is mostly fat.',
      );
    }
  }

  // --- Clinical-flag cautions -------------------------------------------
  if (lowImpact) {
    notes.push(
      'Cardio is written as low-impact (walking, stationary cycling, or pool work) rather than running or jumping.',
    );
  }
  if (flags.includes('cardiac_condition')) {
    notes.push(
      'Cardiac condition on file: clear this plan with the patient’s physician before starting, and stop for chest pain, unusual breathlessness, or dizziness.',
    );
  }
  if (flags.includes('mobility_limitation')) {
    notes.push(
      'Mobility limitation on file: substitute seated or supported versions of any movement that provokes pain, and clear this plan with the patient’s physician before starting.',
    );
  }
  if (flags.includes('glp1')) {
    notes.push(
      'On a GLP-1: protein intake and resistance training are the priority. Appetite suppression makes lean-mass loss the main risk — re-check protein intake at every visit.',
    );
  }
  if (edHistory) {
    notes.push(
      'Eating-disorder history on file: deficit framing has been left off this plan on purpose. Review the calorie target and a monitoring plan before handing the document to the patient.',
    );
  }
  if (flags.includes('pregnancy_lactation')) {
    notes.push(
      'Pregnancy/lactation on file: energy and protein needs are elevated and are not modelled here. Provider review required before use.',
    );
  }

  return {
    resistanceDaysPerWeek: template.resistanceDaysPerWeek,
    cardioMinutesPerWeek: template.cardioMinutesPerWeek,
    rampWeeks,
    split,
    notes,
  };
}
