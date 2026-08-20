/**
 * Pure helpers for the intake form (WS-C).
 *
 * The form state is all strings (that is what inputs give us); conversion to
 * the metric `Patient` record happens once, at save time, in `toPatient`.
 * Storage is ALWAYS metric — imperial entry is a UI-layer concern.
 *
 * Nothing in here touches the DOM, the store, or the engine, so it is cheap to
 * unit-test.
 */

import type {
  ActivityLevel,
  ClinicalFlag,
  ExerciseEntry,
  Goal,
  Patient,
  Sex,
} from '../engine/types';

/* ------------------------------------------------------------------ *
 * Unit conversion
 * ------------------------------------------------------------------ */

export const LB_PER_KG = 2.2046226218487757;
export const CM_PER_IN = 2.54;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_IN;
}

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inches = Math.round(totalIn - ft * 12);
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }
  return { ft, in: inches };
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function ffmFromBodyFat(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100);
}

export function bodyFatFromFfm(weightKg: number, ffmKg: number): number {
  return (1 - ffmKg / weightKg) * 100;
}

/** Whole years between `dob` (ISO date) and `on` (default: today). */
export function ageYears(dob: string, on: Date = new Date()): number | null {
  const d = parseIsoDate(dob);
  if (!d) return null;
  let age = on.getFullYear() - d.getFullYear();
  const m = on.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age -= 1;
  return age;
}

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, mo - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return d;
}

/* ------------------------------------------------------------------ *
 * Parsing / formatting
 * ------------------------------------------------------------------ */

/** Lenient numeric parse of a form field. Blank / unparseable → null. */
export function parseNum(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Trailing-zero-free fixed formatting, e.g. 50.9 / 74 / 167.6. */
export function fmt(n: number, places = 1): string {
  return String(round(n, places));
}

/* ------------------------------------------------------------------ *
 * Option lists (mock phrasing)
 * ------------------------------------------------------------------ */

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary — desk-bound, little walking' },
  { value: 'light', label: 'Light — mostly seated, some walking' },
  { value: 'moderate', label: 'Moderate — on feet much of the day' },
  { value: 'active', label: 'Active — physically demanding work' },
  { value: 'very_active', label: 'Very active — heavy labour or two-a-days' },
];

export const GOAL_OPTIONS: { value: Goal; label: string; meta: string }[] = [
  { value: 'lose_fat', label: 'Lose fat', meta: '−15 to −25%' },
  { value: 'gain_muscle', label: 'Gain muscle', meta: '+10 to +20%' },
  { value: 'maintain', label: 'Maintain', meta: 'TDEE' },
  { value: 'improve_a1c', label: 'Improve A1c', meta: '−10 to −20%' },
];

export const FLAG_OPTIONS: { value: ClinicalFlag; label: string }[] = [
  { value: 'renal_disease', label: 'Renal disease' },
  { value: 'cardiac_condition', label: 'Cardiac condition' },
  { value: 'pregnancy_lactation', label: 'Pregnancy / lactation' },
  { value: 'eating_disorder_history', label: 'Eating-disorder history' },
  { value: 'mobility_limitation', label: 'Mobility limitation' },
  { value: 'glp1', label: 'On GLP-1' },
];

export const EXERCISE_TYPE_SUGGESTIONS = [
  'Resistance training',
  'Walking (brisk)',
  'Running',
  'Cycling',
  'Swimming',
  'Yoga / Pilates',
  'Group fitness class',
];

/* ------------------------------------------------------------------ *
 * Form model
 * ------------------------------------------------------------------ */

export type WeightUnit = 'lb' | 'kg';
export type BodyCompSource = 'scan' | 'none';

export interface ExerciseRow {
  key: string;
  type: string;
  sessionsPerWeek: string;
  minutesPerSession: string;
}

export interface IntakeForm {
  firstName: string;
  lastName: string;
  dob: string;
  sex: '' | Sex;
  heightFt: string;
  heightIn: string;
  weight: string;
  weightUnit: WeightUnit;
  bodyCompSource: BodyCompSource;
  bodyFatPct: string;
  ffmKg: string;
  /** Which body-comp field the provider typed last; the other is derived. */
  bodyCompLast: 'bf' | 'ffm' | null;
  measuredRmrKcal: string;
  /** Free text, UI-only — the Patient model has no field for it. */
  rmrMethod: string;
  activityLevel: '' | ActivityLevel;
  exercise: ExerciseRow[];
  recallCalories: string;
  recallProteinG: string;
  goal: Goal;
  clinicalFlags: ClinicalFlag[];
}

let rowSeq = 0;
export function newExerciseRow(row: Partial<ExerciseRow> = {}): ExerciseRow {
  rowSeq += 1;
  return {
    key: `ex-${rowSeq}`,
    type: '',
    sessionsPerWeek: '',
    minutesPerSession: '',
    ...row,
  };
}

export function emptyForm(): IntakeForm {
  return {
    firstName: '',
    lastName: '',
    dob: '',
    sex: '',
    heightFt: '',
    heightIn: '',
    weight: '',
    weightUnit: 'lb',
    bodyCompSource: 'none',
    bodyFatPct: '',
    ffmKg: '',
    bodyCompLast: null,
    measuredRmrKcal: '',
    rmrMethod: '',
    activityLevel: '',
    exercise: [newExerciseRow()],
    recallCalories: '',
    recallProteinG: '',
    goal: 'lose_fat',
    clinicalFlags: [],
  };
}

/** Prefill from a stored (metric) patient; weight comes back as lb. */
export function formFromPatient(p: Patient): IntakeForm {
  const h = cmToFtIn(p.heightCm);
  const hasComp = p.bodyFatPct != null || p.ffmKg != null;
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    dob: p.dob,
    sex: p.sex,
    heightFt: String(h.ft),
    heightIn: String(h.in),
    weight: fmt(kgToLb(p.weightKg), 1),
    weightUnit: 'lb',
    bodyCompSource: hasComp ? 'scan' : 'none',
    bodyFatPct: p.bodyFatPct != null ? fmt(p.bodyFatPct, 1) : '',
    ffmKg: p.ffmKg != null ? fmt(p.ffmKg, 1) : '',
    bodyCompLast: p.bodyFatPct != null ? 'bf' : p.ffmKg != null ? 'ffm' : null,
    measuredRmrKcal: p.measuredRmrKcal != null ? String(p.measuredRmrKcal) : '',
    rmrMethod: '',
    activityLevel: p.activityLevel,
    exercise:
      p.exercise.length > 0
        ? p.exercise.map((e) =>
            newExerciseRow({
              type: e.type,
              sessionsPerWeek: String(e.sessionsPerWeek),
              minutesPerSession: String(e.minutesPerSession),
            }),
          )
        : [newExerciseRow()],
    recallCalories: p.recall?.calories != null ? String(p.recall.calories) : '',
    recallProteinG: p.recall?.proteinG != null ? String(p.recall.proteinG) : '',
    goal: p.goal,
    clinicalFlags: [...p.clinicalFlags],
  };
}

/** Maya-Torres-like demo values. Fills the form; never saves. */
export function exampleForm(): IntakeForm {
  return {
    ...emptyForm(),
    firstName: 'Maya',
    lastName: 'Torres',
    dob: '1992-03-14',
    sex: 'female',
    heightFt: '5',
    heightIn: '6',
    weight: '165',
    weightUnit: 'lb',
    bodyCompSource: 'scan',
    bodyFatPct: '32',
    ffmKg: fmt(ffmFromBodyFat(lbToKg(165), 32), 1),
    bodyCompLast: 'bf',
    measuredRmrKcal: '',
    rmrMethod: '',
    activityLevel: 'light',
    exercise: [
      newExerciseRow({
        type: 'Resistance training',
        sessionsPerWeek: '4',
        minutesPerSession: '60',
      }),
    ],
    recallCalories: '1430',
    recallProteinG: '68',
    goal: 'lose_fat',
    clinicalFlags: [],
  };
}

/* ------------------------------------------------------------------ *
 * Derived values
 * ------------------------------------------------------------------ */

/** Weight in kg from the form's number + unit toggle. */
export function formWeightKg(form: IntakeForm): number | null {
  const w = parseNum(form.weight);
  if (w == null || w <= 0) return null;
  return form.weightUnit === 'kg' ? w : lbToKg(w);
}

export function formHeightCm(form: IntakeForm): number | null {
  const ft = parseNum(form.heightFt);
  const inches = parseNum(form.heightIn) ?? 0;
  if (ft == null) return null;
  const cm = ftInToCm(ft, inches);
  return cm > 0 ? cm : null;
}

/** "Stored metric: 167.6 cm · 74.8 kg · BMI 26.6" — blank until both are known. */
export function metricLine(form: IntakeForm): string | null {
  const cm = formHeightCm(form);
  const kg = formWeightKg(form);
  if (cm == null || kg == null) return null;
  return `Stored metric: ${fmt(cm, 1)} cm · ${fmt(kg, 1)} kg · BMI ${fmt(bmi(kg, cm), 1)}`;
}

/** FFM implied by the body-composition group, if any. */
export function formFfmKg(form: IntakeForm): number | null {
  if (form.bodyCompSource !== 'scan') return null;
  const direct = parseNum(form.ffmKg);
  if (direct != null && direct > 0) return direct;
  const bf = parseNum(form.bodyFatPct);
  const kg = formWeightKg(form);
  if (bf == null || kg == null) return null;
  return ffmFromBodyFat(kg, bf);
}

export function weeklyExerciseMinutes(form: IntakeForm): number {
  return form.exercise.reduce((sum, row) => {
    const s = parseNum(row.sessionsPerWeek);
    const m = parseNum(row.minutesPerSession);
    if (s == null || m == null || s <= 0 || m <= 0) return sum;
    return sum + s * m;
  }, 0);
}

/* ------------------------------------------------------------------ *
 * Body-composition cross-derivation
 * ------------------------------------------------------------------ */

/** Recompute the *other* body-comp field from whichever was typed last. */
function rederiveBodyComp(form: IntakeForm): IntakeForm {
  const kg = formWeightKg(form);
  if (kg == null || form.bodyCompSource !== 'scan') return form;

  if (form.bodyCompLast === 'bf') {
    const bf = parseNum(form.bodyFatPct);
    if (bf == null) return { ...form, ffmKg: '' };
    return { ...form, ffmKg: fmt(ffmFromBodyFat(kg, bf), 1) };
  }
  if (form.bodyCompLast === 'ffm') {
    const ffm = parseNum(form.ffmKg);
    if (ffm == null) return { ...form, bodyFatPct: '' };
    return { ...form, bodyFatPct: fmt(bodyFatFromFfm(kg, ffm), 1) };
  }
  return form;
}

export function setBodyFat(form: IntakeForm, value: string): IntakeForm {
  return rederiveBodyComp({ ...form, bodyFatPct: value, bodyCompLast: 'bf' });
}

export function setFfm(form: IntakeForm, value: string): IntakeForm {
  return rederiveBodyComp({ ...form, ffmKg: value, bodyCompLast: 'ffm' });
}

export function setWeight(form: IntakeForm, value: string): IntakeForm {
  return rederiveBodyComp({ ...form, weight: value });
}

/** Unit toggle converts the number in place so the patient's weight is unchanged. */
export function setWeightUnit(form: IntakeForm, unit: WeightUnit): IntakeForm {
  if (unit === form.weightUnit) return form;
  const n = parseNum(form.weight);
  const converted =
    n == null ? form.weight : fmt(unit === 'kg' ? lbToKg(n) : kgToLb(n), 1);
  return rederiveBodyComp({ ...form, weight: converted, weightUnit: unit });
}

export function setBodyCompSource(form: IntakeForm, source: BodyCompSource): IntakeForm {
  if (source === 'none') {
    return { ...form, bodyCompSource: 'none', bodyFatPct: '', ffmKg: '', bodyCompLast: null };
  }
  return rederiveBodyComp({ ...form, bodyCompSource: 'scan' });
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export const LIMITS = {
  heightCm: [90, 250] as const,
  weightKg: [30, 300] as const,
  bodyFatPct: [5, 60] as const,
  measuredRmrKcal: [500, 5000] as const,
  sessionsPerWeek: [1, 21] as const,
  minutesPerSession: [1, 480] as const,
  recallCalories: [200, 10000] as const,
  recallProteinG: [0, 500] as const,
};

export type IntakeErrors = Record<string, string>;

/** Error key for an exercise row field, e.g. `exercise.0.sessionsPerWeek`. */
export function exerciseErrorKey(index: number, field: string): string {
  return `exercise.${index}.${field}`;
}

export function validateIntake(form: IntakeForm, now: Date = new Date()): IntakeErrors {
  const errors: IntakeErrors = {};

  if (form.firstName.trim() === '') errors.firstName = 'First name is required.';
  if (form.lastName.trim() === '') errors.lastName = 'Last name is required.';

  if (form.dob.trim() === '') {
    errors.dob = 'Date of birth is required.';
  } else {
    const age = ageYears(form.dob, now);
    if (age == null) errors.dob = 'Enter a valid date.';
    else if (age < 0) errors.dob = 'Date of birth cannot be in the future.';
    else if (age > 120) errors.dob = 'Check the year — that age is out of range.';
  }

  if (form.sex === '') errors.sex = 'Select a biological sex — the RMR equations need it.';

  const cm = formHeightCm(form);
  if (form.heightFt.trim() === '' && form.heightIn.trim() === '') {
    errors.height = 'Height is required.';
  } else if (cm == null) {
    errors.height = 'Enter height as feet and inches.';
  } else if (cm < LIMITS.heightCm[0] || cm > LIMITS.heightCm[1]) {
    errors.height = `Height must be between ${LIMITS.heightCm[0]} and ${LIMITS.heightCm[1]} cm.`;
  }

  const kg = formWeightKg(form);
  if (form.weight.trim() === '') {
    errors.weight = 'Weight is required.';
  } else if (kg == null) {
    errors.weight = 'Enter weight as a number.';
  } else if (kg < LIMITS.weightKg[0] || kg > LIMITS.weightKg[1]) {
    errors.weight = `Weight must be between ${LIMITS.weightKg[0]} and ${LIMITS.weightKg[1]} kg.`;
  }

  if (form.bodyCompSource === 'scan') {
    const bf = parseNum(form.bodyFatPct);
    if (form.bodyFatPct.trim() !== '' && bf == null) {
      errors.bodyFatPct = 'Enter body fat as a number.';
    } else if (bf != null && (bf < LIMITS.bodyFatPct[0] || bf > LIMITS.bodyFatPct[1])) {
      errors.bodyFatPct = `Body fat must be between ${LIMITS.bodyFatPct[0]} and ${LIMITS.bodyFatPct[1]}%.`;
    }

    const ffm = parseNum(form.ffmKg);
    if (form.ffmKg.trim() !== '' && ffm == null) {
      errors.ffmKg = 'Enter fat-free mass as a number.';
    } else if (ffm != null && ffm <= 0) {
      errors.ffmKg = 'Fat-free mass must be greater than zero.';
    } else if (ffm != null && kg != null && ffm >= kg) {
      errors.ffmKg = 'Fat-free mass must be less than total weight.';
    }
  }

  const rmr = parseNum(form.measuredRmrKcal);
  if (form.measuredRmrKcal.trim() !== '' && rmr == null) {
    errors.measuredRmrKcal = 'Enter measured RMR as a number.';
  } else if (
    rmr != null &&
    (rmr < LIMITS.measuredRmrKcal[0] || rmr > LIMITS.measuredRmrKcal[1])
  ) {
    errors.measuredRmrKcal = `Measured RMR must be between ${LIMITS.measuredRmrKcal[0]} and ${LIMITS.measuredRmrKcal[1]} kcal/day.`;
  }

  if (form.activityLevel === '') errors.activityLevel = 'Select a daily activity level.';

  form.exercise.forEach((row, i) => {
    const hasType = row.type.trim() !== '';
    const s = parseNum(row.sessionsPerWeek);
    const m = parseNum(row.minutesPerSession);
    const touched = hasType || row.sessionsPerWeek.trim() !== '' || row.minutesPerSession.trim() !== '';
    if (!touched) return;

    if (!hasType) errors[exerciseErrorKey(i, 'type')] = 'Name the activity, or clear the row.';
    if (s == null || s < LIMITS.sessionsPerWeek[0] || s > LIMITS.sessionsPerWeek[1]) {
      errors[exerciseErrorKey(i, 'sessionsPerWeek')] =
        `1–${LIMITS.sessionsPerWeek[1]} sessions per week.`;
    }
    if (m == null || m < LIMITS.minutesPerSession[0] || m > LIMITS.minutesPerSession[1]) {
      errors[exerciseErrorKey(i, 'minutesPerSession')] =
        `1–${LIMITS.minutesPerSession[1]} minutes per session.`;
    }
  });

  const cal = parseNum(form.recallCalories);
  if (form.recallCalories.trim() !== '' && cal == null) {
    errors.recallCalories = 'Enter calories as a number.';
  } else if (
    cal != null &&
    (cal < LIMITS.recallCalories[0] || cal > LIMITS.recallCalories[1])
  ) {
    errors.recallCalories = `Calories must be between ${LIMITS.recallCalories[0]} and ${LIMITS.recallCalories[1]}.`;
  }

  const pro = parseNum(form.recallProteinG);
  if (form.recallProteinG.trim() !== '' && pro == null) {
    errors.recallProteinG = 'Enter protein as a number.';
  } else if (
    pro != null &&
    (pro < LIMITS.recallProteinG[0] || pro > LIMITS.recallProteinG[1])
  ) {
    errors.recallProteinG = `Protein must be between ${LIMITS.recallProteinG[0]} and ${LIMITS.recallProteinG[1]} g.`;
  }

  return errors;
}

/* ------------------------------------------------------------------ *
 * Form → Patient
 * ------------------------------------------------------------------ */

export interface ToPatientMeta {
  id: string;
  createdAt: string;
  updatedAt?: string;
  isExample?: boolean;
}

/**
 * Build the metric storage record. Assumes `validateIntake` returned no errors
 * for the required fields; anything optional and blank is simply omitted.
 */
export function toPatient(form: IntakeForm, meta: ToPatientMeta): Patient {
  const heightCm = formHeightCm(form);
  const weightKg = formWeightKg(form);
  if (heightCm == null || weightKg == null || form.sex === '' || form.activityLevel === '') {
    throw new Error('toPatient called with an incomplete form');
  }

  const exercise: ExerciseEntry[] = form.exercise
    .map((row) => ({
      type: row.type.trim(),
      sessionsPerWeek: parseNum(row.sessionsPerWeek) ?? 0,
      minutesPerSession: parseNum(row.minutesPerSession) ?? 0,
    }))
    .filter((e) => e.type !== '' && e.sessionsPerWeek > 0 && e.minutesPerSession > 0);

  const patient: Patient = {
    id: meta.id,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    dob: form.dob,
    sex: form.sex,
    heightCm: round(heightCm, 1),
    weightKg: round(weightKg, 1),
    activityLevel: form.activityLevel,
    exercise,
    goal: form.goal,
    clinicalFlags: [...form.clinicalFlags],
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt ?? new Date().toISOString(),
  };

  if (form.bodyCompSource === 'scan') {
    const bf = parseNum(form.bodyFatPct);
    const ffm = formFfmKg(form);
    if (bf != null) patient.bodyFatPct = round(bf, 1);
    if (ffm != null) patient.ffmKg = round(ffm, 1);
  }

  const rmr = parseNum(form.measuredRmrKcal);
  if (rmr != null) patient.measuredRmrKcal = Math.round(rmr);

  const cal = parseNum(form.recallCalories);
  const pro = parseNum(form.recallProteinG);
  if (cal != null || pro != null) {
    patient.recall = {};
    if (cal != null) patient.recall.calories = Math.round(cal);
    if (pro != null) patient.recall.proteinG = Math.round(pro);
  }

  if (meta.isExample) patient.isExample = true;

  return patient;
}

/** `crypto.randomUUID()` with a fallback for environments that lack it. */
export function newPatientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
