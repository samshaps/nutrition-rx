import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import AppBar from '../components/AppBar';
import { getPatient, savePatient } from '../store/patients';
import type { ActivityLevel, ClinicalFlag, Goal, Sex } from '../engine/types';
import {
  ACTIVITY_OPTIONS,
  EXERCISE_TYPE_SUGGESTIONS,
  FLAG_OPTIONS,
  GOAL_OPTIONS,
  ageYears,
  emptyForm,
  exampleForm,
  exerciseErrorKey,
  fmt,
  formFfmKg,
  formFromPatient,
  metricLine,
  newExerciseRow,
  newPatientId,
  setBodyCompSource,
  setBodyFat,
  setFfm,
  setWeight,
  setWeightUnit,
  toPatient,
  validateIntake,
  weeklyExerciseMinutes,
} from './intakeUtils';
import type { IntakeForm } from './intakeUtils';
import './Intake.css';

/** Inline error text under a field. Renders nothing until submit is attempted. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span className="field-error" id={id} role="alert">
      {message}
    </span>
  );
}

export default function Intake() {
  const { id: routeId } = useParams<{ id: string }>();
  const id = routeId ?? 'new';
  const isNew = id === 'new';
  const navigate = useNavigate();

  const existing = useMemo(() => (isNew ? undefined : getPatient(id)), [id, isNew]);
  const notFound = !isNew && existing === undefined;

  const [patientId] = useState(() => (isNew ? newPatientId() : id));
  const [createdAt] = useState(() => existing?.createdAt ?? new Date().toISOString());
  const [form, setForm] = useState<IntakeForm>(() =>
    existing ? formFromPatient(existing) : emptyForm(),
  );
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => validateIntake(form), [form]);
  const shown = submitted ? errors : ({} as Record<string, string>);
  const errorCount = Object.keys(errors).length;

  const update = <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const age = ageYears(form.dob);
  const metric = metricLine(form);
  const ffm = formFfmKg(form);
  const weeklyMinutes = weeklyExerciseMinutes(form);

  const toggleFlag = (flag: ClinicalFlag) =>
    setForm((f) => ({
      ...f,
      clinicalFlags: f.clinicalFlags.includes(flag)
        ? f.clinicalFlags.filter((x) => x !== flag)
        : [...f.clinicalFlags, flag],
    }));

  const updateExercise = (index: number, patch: Partial<IntakeForm['exercise'][number]>) =>
    setForm((f) => ({
      ...f,
      exercise: f.exercise.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const addExercise = () =>
    setForm((f) => ({ ...f, exercise: [...f.exercise, newExerciseRow()] }));

  const removeExercise = (index: number) =>
    setForm((f) => {
      const next = f.exercise.filter((_, i) => i !== index);
      return { ...f, exercise: next.length > 0 ? next : [newExerciseRow()] };
    });

  /** Validate, persist, and hand back the id — or null when the form is invalid. */
  const commit = (): string | null => {
    setSubmitted(true);
    if (Object.keys(validateIntake(form)).length > 0) {
      // Bring the first problem into view; no alert()s anywhere in this form.
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          const first = document.querySelector('.intake-page .field-error');
          if (first && typeof first.scrollIntoView === 'function') {
            first.scrollIntoView({ block: 'center' });
          }
        });
      }
      return null;
    }
    const saved = savePatient(
      toPatient(form, {
        id: patientId,
        createdAt,
        isExample: existing?.isExample,
      }),
    );
    return saved.id;
  };

  const handleGenerate = (event: FormEvent) => {
    event.preventDefault();
    const savedId = commit();
    if (savedId) navigate(`/patient/${savedId}/plan`);
  };

  const handleSave = () => {
    const savedId = commit();
    if (savedId) navigate('/');
  };

  const handleLoadExample = () => {
    setForm(exampleForm());
    setSubmitted(false);
  };

  // Unknown patient id — nothing to edit.
  if (notFound) return <Navigate to="/" replace />;

  const displayName =
    [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ') ||
    (isNew ? 'New patient' : 'Patient');

  return (
    <div className="intake-page">
      <AppBar />

      <form onSubmit={handleGenerate} noValidate>
        <div className="page-head">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link className="crumb-link" to="/">
              Patients
            </Link>
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="crumb-current">{displayName}</span>
          </nav>
          <h1 className="page-title">Intake</h1>
          <p className="page-sub">
            Clinical inputs for the plan. Required groups produce a plan on their own; the
            optional groups sharpen the math.
          </p>
        </div>

        <div className="form-col">
          {/* 1 · Identity ------------------------------------------------ */}
          <section className="group" aria-labelledby="grp-identity">
            <div className="group-head">
              <span className="group-label" id="grp-identity">
                <span className="group-num">01</span>Identity
              </span>
            </div>
            <div className="row">
              <div className="field">
                <label className="label" htmlFor="firstName">
                  First name
                </label>
                <input
                  id="firstName"
                  className={`input${shown.firstName ? ' input-invalid' : ''}`}
                  value={form.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                  autoComplete="off"
                  aria-invalid={shown.firstName ? true : undefined}
                  aria-describedby={shown.firstName ? 'err-firstName' : undefined}
                />
                <FieldError id="err-firstName" message={shown.firstName} />
              </div>
              <div className="field">
                <label className="label" htmlFor="lastName">
                  Last name
                </label>
                <input
                  id="lastName"
                  className={`input${shown.lastName ? ' input-invalid' : ''}`}
                  value={form.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                  autoComplete="off"
                  aria-invalid={shown.lastName ? true : undefined}
                  aria-describedby={shown.lastName ? 'err-lastName' : undefined}
                />
                <FieldError id="err-lastName" message={shown.lastName} />
              </div>
              <div className="field field-narrow">
                <label className="label" htmlFor="dob">
                  Date of birth
                </label>
                <input
                  id="dob"
                  type="date"
                  className={`input input-num${shown.dob ? ' input-invalid' : ''}`}
                  value={form.dob}
                  onChange={(e) => update('dob', e.target.value)}
                  aria-invalid={shown.dob ? true : undefined}
                  aria-describedby={shown.dob ? 'err-dob' : undefined}
                />
                <FieldError id="err-dob" message={shown.dob} />
              </div>
            </div>
            <p className="helper">
              {age != null && age >= 0
                ? `Age ${age} at today's date — used by the Mifflin-St Jeor equation.`
                : "Age at today's date is used by the Mifflin-St Jeor equation."}
            </p>
          </section>

          {/* 2 · Anthropometrics ---------------------------------------- */}
          <section className="group" aria-labelledby="grp-anthro">
            <div className="group-head">
              <span className="group-label" id="grp-anthro">
                <span className="group-num">02</span>Anthropometrics
              </span>
            </div>
            <div className="row">
              <div className="field">
                <span className="label" id="lbl-sex">
                  Biological sex
                </span>
                <div
                  className={`segmented${shown.sex ? ' segmented-invalid' : ''}`}
                  role="group"
                  aria-labelledby="lbl-sex"
                >
                  {(
                    [
                      ['female', 'Female'],
                      ['male', 'Male'],
                    ] as [Sex, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`seg${form.sex === value ? ' seg-on' : ''}`}
                      aria-pressed={form.sex === value}
                      onClick={() => update('sex', value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <FieldError id="err-sex" message={shown.sex} />
              </div>

              <div className="field">
                <span className="label" id="lbl-height">
                  Height
                </span>
                <div className="row" style={{ gap: 10 }}>
                  <div
                    className={`input-group${shown.height ? ' input-group-invalid' : ''}`}
                    style={{ flex: '1 1 90px' }}
                  >
                    <input
                      id="heightFt"
                      className="input input-num"
                      inputMode="numeric"
                      value={form.heightFt}
                      onChange={(e) => update('heightFt', e.target.value)}
                      aria-label="Height, feet"
                      aria-invalid={shown.height ? true : undefined}
                      aria-describedby={shown.height ? 'err-height' : undefined}
                    />
                    <span className="suffix">ft</span>
                  </div>
                  <div
                    className={`input-group${shown.height ? ' input-group-invalid' : ''}`}
                    style={{ flex: '1 1 90px' }}
                  >
                    <input
                      id="heightIn"
                      className="input input-num"
                      inputMode="numeric"
                      value={form.heightIn}
                      onChange={(e) => update('heightIn', e.target.value)}
                      aria-label="Height, inches"
                      aria-invalid={shown.height ? true : undefined}
                    />
                    <span className="suffix">in</span>
                  </div>
                </div>
                <FieldError id="err-height" message={shown.height} />
              </div>

              <div className="field">
                <label className="label" htmlFor="weight">
                  Current weight
                </label>
                <div className={`input-group${shown.weight ? ' input-group-invalid' : ''}`}>
                  <input
                    id="weight"
                    className="input input-num"
                    inputMode="decimal"
                    value={form.weight}
                    onChange={(e) => setForm((f) => setWeight(f, e.target.value))}
                    aria-invalid={shown.weight ? true : undefined}
                    aria-describedby={shown.weight ? 'err-weight' : undefined}
                  />
                  <span className="unit-toggle" role="group" aria-label="Weight unit">
                    {(['lb', 'kg'] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        className={`unit${form.weightUnit === unit ? ' unit-on' : ''}`}
                        aria-pressed={form.weightUnit === unit}
                        onClick={() => setForm((f) => setWeightUnit(f, unit))}
                      >
                        {unit}
                      </button>
                    ))}
                  </span>
                </div>
                <FieldError id="err-weight" message={shown.weight} />
              </div>
            </div>
            <p className="helper">
              {metric ?? 'Stored metric: enter height and weight to see the conversion.'}
            </p>
          </section>

          {/* 3 · Body composition --------------------------------------- */}
          <section className="group" aria-labelledby="grp-bodycomp">
            <div className="group-head">
              <span className="group-label" id="grp-bodycomp">
                <span className="group-num">03</span>Body composition
              </span>
              <span className="tag-optional">Optional</span>
              <span className="group-unlock">
                Unlocks FFM-based RMR and the energy-availability check.
              </span>
            </div>
            <div className="field">
              <span className="label" id="lbl-bodycomp-source">
                Source
              </span>
              <div className="segmented" role="group" aria-labelledby="lbl-bodycomp-source">
                {(
                  [
                    ['scan', 'InBody / DEXA scan'],
                    ['none', 'Not available'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`seg${form.bodyCompSource === value ? ' seg-on' : ''}`}
                    aria-pressed={form.bodyCompSource === value}
                    onClick={() => setForm((f) => setBodyCompSource(f, value))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.bodyCompSource === 'scan' ? (
              <>
                <div className="row" style={{ marginTop: 14 }}>
                  <div className="field field-narrow">
                    <label className="label" htmlFor="bodyFatPct">
                      Body fat <span className="label-hint">%</span>
                    </label>
                    <div
                      className={`input-group${shown.bodyFatPct ? ' input-group-invalid' : ''}`}
                    >
                      <input
                        id="bodyFatPct"
                        className="input input-num"
                        inputMode="decimal"
                        placeholder="%"
                        value={form.bodyFatPct}
                        onChange={(e) => setForm((f) => setBodyFat(f, e.target.value))}
                        aria-invalid={shown.bodyFatPct ? true : undefined}
                        aria-describedby={shown.bodyFatPct ? 'err-bodyFatPct' : undefined}
                      />
                      <span className="suffix">%</span>
                    </div>
                    <FieldError id="err-bodyFatPct" message={shown.bodyFatPct} />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="ffmKg">
                      Fat-free mass{' '}
                      <span className="label-hint">— or enter directly</span>
                    </label>
                    <div className={`input-group${shown.ffmKg ? ' input-group-invalid' : ''}`}>
                      <input
                        id="ffmKg"
                        className="input input-num"
                        inputMode="decimal"
                        placeholder="kg"
                        value={form.ffmKg}
                        onChange={(e) => setForm((f) => setFfm(f, e.target.value))}
                        aria-invalid={shown.ffmKg ? true : undefined}
                        aria-describedby={shown.ffmKg ? 'err-ffmKg' : undefined}
                      />
                      <span className="suffix">kg</span>
                    </div>
                    <FieldError id="err-ffmKg" message={shown.ffmKg} />
                  </div>
                </div>
                {ffm != null ? (
                  <span className="helper-mono">
                    FFM {fmt(ffm, 1)} kg · RMR will use Katch-McArdle
                  </span>
                ) : null}
                <p className="helper">
                  No scan? Choose <strong>Not available</strong> — calculations fall back to
                  the Mifflin-St Jeor population estimate and the energy-availability check is
                  replaced by a caution note on the plan.
                </p>
              </>
            ) : (
              <p className="helper">
                No scan on file — calculations fall back to the Mifflin-St Jeor population
                estimate and the energy-availability check is replaced by a caution note on
                the plan.
              </p>
            )}
          </section>

          {/* 4 · Measured RMR ------------------------------------------- */}
          <section className="group" aria-labelledby="grp-rmr">
            <div className="group-head">
              <span className="group-label" id="grp-rmr">
                <span className="group-num">04</span>Measured RMR
              </span>
              <span className="tag-optional">Optional</span>
              <span className="group-unlock">
                Indirect calorimetry only; overrides all estimates.
              </span>
            </div>
            <div className="row">
              <div className="field field-narrow">
                <label className="label" htmlFor="measuredRmrKcal">
                  Measured RMR
                </label>
                <div
                  className={`input-group${shown.measuredRmrKcal ? ' input-group-invalid' : ''}`}
                >
                  <input
                    id="measuredRmrKcal"
                    className="input input-num"
                    inputMode="numeric"
                    placeholder="kcal/day"
                    value={form.measuredRmrKcal}
                    onChange={(e) => update('measuredRmrKcal', e.target.value)}
                    aria-invalid={shown.measuredRmrKcal ? true : undefined}
                    aria-describedby={
                      shown.measuredRmrKcal ? 'err-measuredRmrKcal' : undefined
                    }
                  />
                  <span className="suffix">kcal</span>
                </div>
                <FieldError id="err-measuredRmrKcal" message={shown.measuredRmrKcal} />
              </div>
              <div className="field" style={{ flex: '2 1 260px' }}>
                <label className="label" htmlFor="rmrMethod">
                  Method
                </label>
                <input
                  id="rmrMethod"
                  className="input"
                  placeholder="Indirect calorimetry, metabolic cart…"
                  value={form.rmrMethod}
                  onChange={(e) => update('rmrMethod', e.target.value)}
                />
              </div>
            </div>
            <p className="helper">
              Leave blank unless the value came from a metabolic cart. An InBody estimate
              belongs in body composition above, not here.
            </p>
          </section>

          {/* 5 · Activity & exercise ------------------------------------ */}
          <section className="group" aria-labelledby="grp-activity">
            <div className="group-head">
              <span className="group-label" id="grp-activity">
                <span className="group-num">05</span>Activity &amp; exercise
              </span>
            </div>
            <div className="row">
              <div className="field field-wide">
                <label className="label" htmlFor="activityLevel">
                  Daily activity level
                </label>
                <select
                  id="activityLevel"
                  className={`input${form.activityLevel === '' ? ' is-placeholder' : ''}${
                    shown.activityLevel ? ' input-invalid' : ''
                  }`}
                  value={form.activityLevel}
                  onChange={(e) =>
                    update('activityLevel', e.target.value as '' | ActivityLevel)
                  }
                  aria-invalid={shown.activityLevel ? true : undefined}
                  aria-describedby={shown.activityLevel ? 'err-activityLevel' : undefined}
                >
                  <option value="">Select daily activity level…</option>
                  {ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <FieldError id="err-activityLevel" message={shown.activityLevel} />
              </div>
            </div>

            <div className="subhead">Structured exercise</div>
            <datalist id="exercise-types">
              {EXERCISE_TYPE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <div className="ex-list">
              {form.exercise.map((row, index) => {
                const typeErr = shown[exerciseErrorKey(index, 'type')];
                const sessErr = shown[exerciseErrorKey(index, 'sessionsPerWeek')];
                const minErr = shown[exerciseErrorKey(index, 'minutesPerSession')];
                return (
                  <div className="ex-row" key={row.key}>
                    <div className="field">
                      <label className="label" htmlFor={`ex-type-${row.key}`}>
                        Type
                      </label>
                      <input
                        id={`ex-type-${row.key}`}
                        className={`input${typeErr ? ' input-invalid' : ''}`}
                        list="exercise-types"
                        placeholder="Resistance training"
                        value={row.type}
                        onChange={(e) => updateExercise(index, { type: e.target.value })}
                        aria-invalid={typeErr ? true : undefined}
                      />
                      <FieldError id={`err-ex-type-${row.key}`} message={typeErr} />
                    </div>
                    <div className="field field-sm">
                      <label className="label" htmlFor={`ex-sessions-${row.key}`}>
                        Sessions/wk
                      </label>
                      <input
                        id={`ex-sessions-${row.key}`}
                        className={`input input-num${sessErr ? ' input-invalid' : ''}`}
                        inputMode="numeric"
                        value={row.sessionsPerWeek}
                        onChange={(e) =>
                          updateExercise(index, { sessionsPerWeek: e.target.value })
                        }
                        aria-invalid={sessErr ? true : undefined}
                      />
                      <FieldError id={`err-ex-sessions-${row.key}`} message={sessErr} />
                    </div>
                    <div className="field field-sm">
                      <label className="label" htmlFor={`ex-minutes-${row.key}`}>
                        Min/session
                      </label>
                      <input
                        id={`ex-minutes-${row.key}`}
                        className={`input input-num${minErr ? ' input-invalid' : ''}`}
                        inputMode="numeric"
                        value={row.minutesPerSession}
                        onChange={(e) =>
                          updateExercise(index, { minutesPerSession: e.target.value })
                        }
                        aria-invalid={minErr ? true : undefined}
                      />
                      <FieldError id={`err-ex-minutes-${row.key}`} message={minErr} />
                    </div>
                    <button
                      type="button"
                      className="ex-remove"
                      onClick={() => removeExercise(index)}
                      aria-label={`Remove exercise row ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="ex-add" onClick={addExercise}>
              + Add exercise
            </button>
            <div className="ex-summary">
              {weeklyMinutes} min/wk structured · exercise energy expenditure estimated per
              session for the EA check
            </div>
          </section>

          {/* 6 · 24-hour recall ----------------------------------------- */}
          <section className="group" aria-labelledby="grp-recall">
            <div className="group-head">
              <span className="group-label" id="grp-recall">
                <span className="group-num">06</span>24-hour recall
              </span>
              <span className="tag-optional">Optional</span>
            </div>
            <div className="row">
              <div className="field field-narrow">
                <label className="label" htmlFor="recallCalories">
                  Current calories
                </label>
                <div
                  className={`input-group${shown.recallCalories ? ' input-group-invalid' : ''}`}
                >
                  <input
                    id="recallCalories"
                    className="input input-num"
                    inputMode="numeric"
                    value={form.recallCalories}
                    onChange={(e) => update('recallCalories', e.target.value)}
                    aria-invalid={shown.recallCalories ? true : undefined}
                    aria-describedby={shown.recallCalories ? 'err-recallCalories' : undefined}
                  />
                  <span className="suffix">kcal</span>
                </div>
                <FieldError id="err-recallCalories" message={shown.recallCalories} />
              </div>
              <div className="field field-narrow">
                <label className="label" htmlFor="recallProteinG">
                  Current protein
                </label>
                <div
                  className={`input-group${shown.recallProteinG ? ' input-group-invalid' : ''}`}
                >
                  <input
                    id="recallProteinG"
                    className="input input-num"
                    inputMode="numeric"
                    value={form.recallProteinG}
                    onChange={(e) => update('recallProteinG', e.target.value)}
                    aria-invalid={shown.recallProteinG ? true : undefined}
                    aria-describedby={shown.recallProteinG ? 'err-recallProteinG' : undefined}
                  />
                  <span className="suffix">g</span>
                </div>
                <FieldError id="err-recallProteinG" message={shown.recallProteinG} />
              </div>
              <div className="field" />
            </div>
            <p className="helper">Shown on the plan as current vs. target.</p>
          </section>

          {/* 7 · Goal ---------------------------------------------------- */}
          <section className="group" aria-labelledby="grp-goal">
            <div className="group-head">
              <span className="group-label" id="grp-goal">
                <span className="group-num">07</span>Goal
              </span>
              <span className="group-unlock">
                Single select. Drives the energy adjustment and the exercise template.
              </span>
            </div>
            <div className="goals" role="radiogroup" aria-labelledby="grp-goal">
              {GOAL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`goal${form.goal === opt.value ? ' goal-on' : ''}`}
                >
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="goal"
                    value={opt.value}
                    checked={form.goal === opt.value}
                    onChange={() => update('goal', opt.value as Goal)}
                  />
                  <span className="radio" aria-hidden="true" />
                  <span className="goal-name">{opt.label}</span>
                  <span className="goal-meta">{opt.meta}</span>
                </label>
              ))}
            </div>
          </section>

          {/* 8 · Clinical flags ------------------------------------------ */}
          <section className="group" aria-labelledby="grp-flags">
            <div className="group-head">
              <span className="group-label" id="grp-flags">
                <span className="group-num">08</span>Clinical flags
              </span>
            </div>
            <div className="flags">
              {FLAG_OPTIONS.map((opt) => (
                <label className="flag" key={opt.value}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={form.clinicalFlags.includes(opt.value)}
                    onChange={() => toggleFlag(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="note">
              Flags cap protein dosing and adjust the exercise prescription.
            </p>
          </section>
        </div>

        <div className="footerbar">
          <div className="footerbar-inner">
            {submitted && errorCount > 0 ? (
              <span className="form-error-summary" role="alert">
                {errorCount === 1
                  ? '1 field needs attention before this plan can be generated.'
                  : `${errorCount} fields need attention before this plan can be generated.`}
              </span>
            ) : (
              <span className="save-note">Saved locally · never leaves this browser</span>
            )}
            <button type="button" className="btn-secondary" onClick={handleLoadExample}>
              Load example
            </button>
            <button type="button" className="btn-secondary" onClick={handleSave}>
              Save
            </button>
            <button type="submit" className="btn-primary">
              Generate plan →
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
