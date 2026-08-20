import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../App';
import AppBar from '../components/AppBar';
import {
  STORAGE_KEY,
  clearAll,
  deletePatient,
  ensureSeeds,
  getPatient,
  listPatients,
  savePatient,
} from '../store/patients';
import { SEED_PATIENTS } from '../store/seeds';
import { generatePlan } from '../engine';
import type { EngineInput, Patient } from '../engine/types';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('app shell', () => {
  it('renders the AppBar wordmark and storage note', () => {
    render(
      <MemoryRouter>
        <AppBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Nutrition Rx')).toBeInTheDocument();
    expect(screen.getByText('All data stays in this browser')).toBeInTheDocument();
  });

  it('routes / to the roster', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Patients' })).toBeInTheDocument();
  });

  it('routes /patient/:id/edit to intake', () => {
    ensureSeeds();
    renderAt('/patient/seed-maya-torres-0001/edit');
    expect(screen.getByRole('heading', { name: 'Intake' })).toBeInTheDocument();
  });

  it('routes /patient/:id/plan to the plan document', () => {
    ensureSeeds();
    renderAt('/patient/seed-maya-torres-0001/plan');
    expect(screen.getByRole('heading', { name: 'Maya Torres' })).toBeInTheDocument();
  });

  it('redirects unknown routes to the roster', () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <Routes>
          <Route path="*" element={<App />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Patients' })).toBeInTheDocument();
  });
});

describe('patient store', () => {
  beforeEach(() => {
    clearAll();
  });

  it('seeds three example patients once, idempotently', () => {
    ensureSeeds();
    ensureSeeds();
    const all = listPatients();
    expect(all).toHaveLength(3);
    expect(all.every((p) => p.isExample)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"seeded":true');
  });

  it('does not resurrect a deleted seed', () => {
    ensureSeeds();
    deletePatient('seed-maya-torres-0001');
    ensureSeeds();
    expect(getPatient('seed-maya-torres-0001')).toBeUndefined();
    expect(listPatients()).toHaveLength(2);
  });

  it('saves, reads back, and deletes a patient', () => {
    const patient: Patient = {
      id: 'test-1',
      firstName: 'Test',
      lastName: 'Patient',
      dob: '1990-01-01',
      sex: 'female',
      heightCm: 165,
      weightKg: 70,
      activityLevel: 'light',
      exercise: [],
      goal: 'maintain',
      clinicalFlags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    savePatient(patient);
    const stored = getPatient('test-1');
    expect(stored?.firstName).toBe('Test');
    expect(stored?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(stored?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');

    deletePatient('test-1');
    expect(getPatient('test-1')).toBeUndefined();
  });
});

describe('seed data', () => {
  it('carries the canonical clamp case with scan-derived body comp', () => {
    const maya = SEED_PATIENTS.find((p) => p.lastName === 'Torres');
    expect(maya).toMatchObject({
      sex: 'female',
      dob: '1992-03-14',
      heightCm: 167.6,
      weightKg: 74.8,
      bodyFatPct: 32,
      ffmKg: 50.9,
      goal: 'lose_fat',
      activityLevel: 'light',
      isExample: true,
    });
    expect(maya?.clinicalFlags).toEqual([]);
  });

  it('has one seed with no body composition (Mifflin / EA-warning path)', () => {
    const devon = SEED_PATIENTS.find((p) => p.lastName === 'Park');
    expect(devon?.bodyFatPct).toBeUndefined();
    expect(devon?.ffmKg).toBeUndefined();
    expect(devon?.goal).toBe('gain_muscle');
  });
});

describe('engine end-to-end (canonical clamp case)', () => {
  it('clamps Maya to the energy-availability floor with the expected numbers', () => {
    const input: EngineInput = {
      sex: 'female',
      ageYears: 34,
      heightCm: 167.6,
      weightKg: 74.8,
      bodyFatPct: 32,
      ffmKg: 50.9,
      activityLevel: 'light',
      exercise: [{ type: 'Resistance training', sessionsPerWeek: 4, minutesPerSession: 60 }],
      goal: 'lose_fat',
      clinicalFlags: [],
    };
    const plan = generatePlan(input);
    expect(plan.rmr).toMatchObject({ kcal: 1469, source: 'ffm' });
    expect(plan.target.kcal).toBe(1750);
    expect(plan.target.clamped).toMatchObject({ clampedBy: 'ea_floor' });
    expect(plan.ea?.band).toBe('reduced');
    expect(plan.ea?.value).toBeGreaterThanOrEqual(30);
    expect(plan.macros.proteinG).toBe(150);
    expect(plan.macros.proteinPerKg).toBe(2);
  });
});
