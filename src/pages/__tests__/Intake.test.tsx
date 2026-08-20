import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Intake from '../Intake';
import {
  bodyFatFromFfm,
  cmToFtIn,
  emptyForm,
  exampleForm,
  ffmFromBodyFat,
  ftInToCm,
  lbToKg,
  metricLine,
  setBodyCompSource,
  setBodyFat,
  setFfm,
  setWeightUnit,
  toPatient,
  validateIntake,
} from '../intakeUtils';
import { clearAll, getPatient, listPatients, savePatient } from '../../store/patients';
import type { Patient } from '../../engine/types';

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

describe('intakeUtils — units', () => {
  it('converts 5 ft 6 in to 167.6 cm', () => {
    expect(ftInToCm(5, 6)).toBeCloseTo(167.64, 2);
    expect(cmToFtIn(167.6)).toEqual({ ft: 5, in: 6 });
  });

  it('converts 165 lb to 74.8 kg', () => {
    expect(lbToKg(165)).toBeCloseTo(74.84, 2);
  });

  it('renders the stored-metric line like the mock', () => {
    const form = { ...exampleForm() };
    expect(metricLine(form)).toBe('Stored metric: 167.6 cm · 74.8 kg · BMI 26.6');
  });

  it('derives FFM from body fat and back', () => {
    const kg = lbToKg(165);
    expect(ffmFromBodyFat(kg, 32)).toBeCloseTo(50.9, 1);
    expect(bodyFatFromFfm(kg, 50.9)).toBeCloseTo(32, 0);
  });
});

describe('intakeUtils — body composition cross-derivation', () => {
  const base = { ...exampleForm(), bodyFatPct: '', ffmKg: '', bodyCompLast: null } as const;

  it('body fat derives FFM', () => {
    const next = setBodyFat({ ...base }, '32');
    expect(next.ffmKg).toBe('50.9');
  });

  it('FFM derives body fat', () => {
    const next = setFfm({ ...base }, '50.9');
    expect(Number(next.bodyFatPct)).toBeCloseTo(32, 0);
  });

  it('"Not available" clears both values', () => {
    const next = setBodyCompSource(exampleForm(), 'none');
    expect(next.bodyFatPct).toBe('');
    expect(next.ffmKg).toBe('');
  });

  it('unit toggle converts the entered weight in place', () => {
    const next = setWeightUnit(exampleForm(), 'kg');
    expect(next.weight).toBe('74.8');
    expect(next.weightUnit).toBe('kg');
    // and back — 74.8 kg is 164.9 lb; the 0.1 kg display precision is the only loss
    expect(setWeightUnit(next, 'lb').weight).toBe('164.9');
  });
});

describe('intakeUtils — validation', () => {
  it('flags every required field on an empty form', () => {
    const e = validateIntake(emptyForm());
    expect(Object.keys(e).sort()).toEqual(
      ['activityLevel', 'dob', 'firstName', 'height', 'lastName', 'sex', 'weight'].sort(),
    );
  });

  it('accepts the example form', () => {
    expect(validateIntake(exampleForm())).toEqual({});
  });

  it('rejects out-of-range height, weight and body fat', () => {
    const tall = validateIntake({ ...exampleForm(), heightFt: '9', heightIn: '0' });
    expect(tall.height).toBeTruthy();

    const heavy = validateIntake({ ...exampleForm(), weight: '700' });
    expect(heavy.weight).toBeTruthy();

    const light = validateIntake({ ...exampleForm(), weight: '50' }); // 22.7 kg
    expect(light.weight).toBeTruthy();

    const bf = validateIntake({ ...exampleForm(), bodyFatPct: '72' });
    expect(bf.bodyFatPct).toBeTruthy();
  });

  it('rejects a half-filled exercise row but ignores an untouched one', () => {
    const partial = validateIntake({
      ...exampleForm(),
      exercise: [{ key: 'a', type: '', sessionsPerWeek: '3', minutesPerSession: '' }],
    });
    expect(partial['exercise.0.type']).toBeTruthy();
    expect(partial['exercise.0.minutesPerSession']).toBeTruthy();

    const blank = validateIntake({
      ...exampleForm(),
      exercise: [{ key: 'a', type: '', sessionsPerWeek: '', minutesPerSession: '' }],
    });
    expect(Object.keys(blank)).toEqual([]);
  });
});

describe('intakeUtils — toPatient stores metric', () => {
  it('converts imperial entry to cm/kg and keeps both body-comp values', () => {
    const p = toPatient(exampleForm(), { id: 'x', createdAt: 'then' });
    expect(p.heightCm).toBe(167.6);
    expect(p.weightKg).toBe(74.8);
    expect(p.bodyFatPct).toBe(32);
    expect(p.ffmKg).toBe(50.9);
    expect(p.exercise).toEqual([
      { type: 'Resistance training', sessionsPerWeek: 4, minutesPerSession: 60 },
    ]);
    expect(p.recall).toEqual({ calories: 1430, proteinG: 68 });
    expect(p.goal).toBe('lose_fat');
  });

  it('omits body composition when the source is "Not available"', () => {
    const p = toPatient(setBodyCompSource(exampleForm(), 'none'), {
      id: 'x',
      createdAt: 'then',
    });
    expect(p.bodyFatPct).toBeUndefined();
    expect(p.ffmKg).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

function renderIntake(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/patient/${id}/edit`]}>
      <Routes>
        <Route path="/patient/:id/edit" element={<Intake />} />
        <Route path="/patient/:id/plan" element={<div>PLAN PAGE</div>} />
        <Route path="/" element={<div>ROSTER PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const EXISTING: Patient = {
  id: 'existing-1',
  firstName: 'Maya',
  lastName: 'Torres',
  dob: '1992-03-14',
  sex: 'female',
  heightCm: 167.6,
  weightKg: 74.8,
  bodyFatPct: 32,
  ffmKg: 50.9,
  activityLevel: 'light',
  exercise: [{ type: 'Resistance training', sessionsPerWeek: 4, minutesPerSession: 60 }],
  recall: { calories: 1430, proteinG: 68 },
  goal: 'lose_fat',
  clinicalFlags: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('<Intake />', () => {
  beforeEach(() => {
    clearAll();
  });

  it('renders the eight groups for a new patient', () => {
    renderIntake('new');
    expect(screen.getByRole('heading', { name: 'Intake' })).toBeInTheDocument();
    expect(screen.getByText('New patient')).toBeInTheDocument();
    for (const label of [
      /Identity/,
      /Anthropometrics/,
      /Body composition/,
      /Measured RMR/,
      /Activity & exercise/,
      /24-hour recall/,
      /Goal/,
      /Clinical flags/,
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Fat loss is the default goal for a new patient.
    expect(screen.getByRole('radio', { name: /Lose fat/ })).toBeChecked();
  });

  it('shows inline errors on submit and saves nothing', () => {
    renderIntake('new');
    fireEvent.click(screen.getByRole('button', { name: /Generate plan/ }));
    expect(screen.getByText('First name is required.')).toBeInTheDocument();
    expect(screen.getByText('Date of birth is required.')).toBeInTheDocument();
    expect(listPatients()).toHaveLength(0);
    expect(screen.queryByText('PLAN PAGE')).not.toBeInTheDocument();
  });

  it('load example fills the form without saving', () => {
    renderIntake('new');
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    expect(screen.getByLabelText('First name')).toHaveValue('Maya');
    expect(
      screen.getByText('Stored metric: 167.6 cm · 74.8 kg · BMI 26.6'),
    ).toBeInTheDocument();
    expect(screen.getByText('FFM 50.9 kg · RMR will use Katch-McArdle')).toBeInTheDocument();
    expect(listPatients()).toHaveLength(0);
  });

  it('generates a plan: saves metric values and navigates', () => {
    renderIntake('new');
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate plan/ }));

    expect(screen.getByText('PLAN PAGE')).toBeInTheDocument();
    const saved = listPatients();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      firstName: 'Maya',
      lastName: 'Torres',
      heightCm: 167.6,
      weightKg: 74.8,
      ffmKg: 50.9,
      activityLevel: 'light',
      goal: 'lose_fat',
    });
  });

  it('the plain Save button routes to the roster', () => {
    renderIntake('new');
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('ROSTER PAGE')).toBeInTheDocument();
    expect(listPatients()).toHaveLength(1);
  });

  it('prefills an existing patient in imperial and preserves the id on save', () => {
    savePatient(EXISTING);
    renderIntake('existing-1');

    expect(screen.getByLabelText('First name')).toHaveValue('Maya');
    expect(screen.getByLabelText('Height, feet')).toHaveValue('5');
    expect(screen.getByLabelText('Height, inches')).toHaveValue('6');
    // 74.8 kg stored → 164.9 lb shown (0.1 kg is the stored precision).
    expect(screen.getByLabelText('Current weight')).toHaveValue('164.9');
    expect(screen.getByRole('button', { name: 'Female' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /Generate plan/ }));
    expect(listPatients()).toHaveLength(1);
    expect(getPatient('existing-1')?.createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('redirects to the roster for an unknown id', () => {
    renderIntake('nope-not-here');
    expect(screen.getByText('ROSTER PAGE')).toBeInTheDocument();
  });

  it('adds and removes exercise rows and keeps the weekly total', () => {
    renderIntake('new');
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    expect(screen.getByText(/240 min\/wk structured/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Add exercise' }));
    const rows = screen.getAllByLabelText('Type');
    expect(rows).toHaveLength(2);

    fireEvent.change(rows[1], { target: { value: 'Walking (brisk)' } });
    const sessions = screen.getAllByLabelText('Sessions/wk');
    const minutes = screen.getAllByLabelText('Min/session');
    fireEvent.change(sessions[1], { target: { value: '3' } });
    fireEvent.change(minutes[1], { target: { value: '30' } });
    expect(screen.getByText(/330 min\/wk structured/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove exercise row 2' }));
    expect(screen.getAllByLabelText('Type')).toHaveLength(1);
    expect(screen.getByText(/240 min\/wk structured/)).toBeInTheDocument();
  });

  it('hides the body-composition fields when the scan is not available', () => {
    renderIntake('new');
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    expect(screen.getByLabelText(/Body fat/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Not available' }));
    expect(screen.queryByLabelText(/Body fat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Katch-McArdle/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'InBody / DEXA scan' }));
    expect(screen.getByLabelText(/Body fat/)).toHaveValue('');
  });

  it('typing a body-fat percentage derives FFM live', () => {
    renderIntake('new');
    fireEvent.change(screen.getByLabelText('Current weight'), { target: { value: '165' } });
    fireEvent.click(screen.getByRole('button', { name: 'InBody / DEXA scan' }));
    fireEvent.change(screen.getByLabelText(/Body fat/), { target: { value: '32' } });
    expect(screen.getByLabelText(/Fat-free mass/)).toHaveValue('50.9');
    expect(screen.getByText('FFM 50.9 kg · RMR will use Katch-McArdle')).toBeInTheDocument();
  });

  it('records clinical flags', () => {
    renderIntake('new');
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Renal disease' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'On GLP-1' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate plan/ }));
    expect(listPatients()[0].clinicalFlags.sort()).toEqual(['glp1', 'renal_disease']);
  });

  it('switching the weight unit converts the number in place', () => {
    renderIntake('new');
    fireEvent.change(screen.getByLabelText('Current weight'), { target: { value: '165' } });
    const toggle = screen.getByRole('group', { name: 'Weight unit' });
    fireEvent.click(within(toggle).getByRole('button', { name: 'kg' }));
    expect(screen.getByLabelText('Current weight')).toHaveValue('74.8');
  });
});
