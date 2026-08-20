import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Roster, { ageFromDob, kgToLb, rmrSourceBadge, statusChip } from '../Roster';
import { clearAll, ensureSeeds, listPatients, savePatient } from '../../store/patients';
import type { Patient } from '../../engine/types';

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Roster />} />
        <Route path="/patient/:id/plan" element={<div>PLAN ROUTE</div>} />
        <Route path="/patient/new/edit" element={<div>NEW INTAKE ROUTE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const basePatient: Patient = {
  id: 'p1',
  firstName: 'Alex',
  lastName: 'Rivera',
  dob: '1990-05-10',
  sex: 'male',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'light',
  exercise: [],
  goal: 'maintain',
  clinicalFlags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('roster derivations', () => {
  it('derives age from dob against a reference date', () => {
    const today = new Date('2026-08-20T00:00:00Z');
    expect(ageFromDob('1992-03-14', today)).toBe(34); // birthday passed
    expect(ageFromDob('1992-12-01', today)).toBe(33); // birthday still ahead
    expect(ageFromDob('not-a-date', today)).toBeNull();
  });

  it('converts stored kg to display lb', () => {
    expect(kgToLb(74.8)).toBe(165);
    expect(kgToLb(82.6)).toBe(182);
    expect(kgToLb(77.6)).toBe(171);
  });

  it('picks the RMR-source badge by engine tier precedence', () => {
    expect(rmrSourceBadge({ ...basePatient, ffmKg: 50 })).toEqual({
      label: 'InBody · FFM',
      estimated: false,
    });
    expect(rmrSourceBadge({ ...basePatient, bodyFatPct: 30 }).label).toBe('InBody · FFM');
    expect(rmrSourceBadge({ ...basePatient, ffmKg: 50, measuredRmrKcal: 1400 }).label).toBe(
      'Measured RMR',
    );
    expect(rmrSourceBadge(basePatient)).toEqual({ label: 'Estimated · Mifflin', estimated: true });
  });

  it('derives the status chip without the engine', () => {
    expect(statusChip(basePatient)).toEqual({ label: 'No body comp', tone: 'neutral' });
    expect(statusChip({ ...basePatient, ffmKg: 50, goal: 'lose_fat' })).toEqual({
      label: 'EA check active',
      tone: 'warn',
    });
    expect(statusChip({ ...basePatient, ffmKg: 50 }).tone).toBe('neutral');
  });
});

describe('Roster page', () => {
  beforeEach(() => {
    clearAll();
    ensureSeeds();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a card per seeded patient with count, goal and source badges', () => {
    renderRoster();

    expect(screen.getByRole('heading', { name: 'Patients' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    const maya = screen.getByRole('link', { name: 'Open plan for Maya Torres' });
    expect(within(maya).getByText('Lose fat')).toBeInTheDocument();
    expect(within(maya).getByText('Example')).toBeInTheDocument();
    expect(within(maya).getByText('165')).toBeInTheDocument();
    expect(within(maya).getByText('InBody · FFM')).toBeInTheDocument();
    expect(within(maya).getByText('EA check active')).toBeInTheDocument();

    const devon = screen.getByRole('link', { name: 'Open plan for Devon Park' });
    expect(within(devon).getByText('Gain muscle')).toBeInTheDocument();
    expect(within(devon).getByText('Estimated · Mifflin')).toBeInTheDocument();
    expect(within(devon).getByText('No body comp')).toBeInTheDocument();
  });

  it('filters by name, case-insensitively', () => {
    renderRoster();

    fireEvent.change(screen.getByLabelText('Search patients by name'), { target: { value: 'pri' } });
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.queryByText('Maya Torres')).not.toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search patients by name'), { target: { value: '' } });
    expect(screen.getByText('Maya Torres')).toBeInTheDocument();
  });

  it('opens the plan route when a card is clicked', () => {
    renderRoster();

    fireEvent.click(screen.getByRole('link', { name: 'Open plan for Maya Torres' }));
    expect(screen.getByText('PLAN ROUTE')).toBeInTheDocument();
  });

  it('routes to the new-patient intake from the app bar action', () => {
    renderRoster();

    fireEvent.click(screen.getByRole('button', { name: '+ New patient' }));
    expect(screen.getByText('NEW INTAKE ROUTE')).toBeInTheDocument();
  });

  it('deletes only after confirmation, without opening the plan', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderRoster();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Maya Torres' }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText('PLAN ROUTE')).not.toBeInTheDocument();
    expect(screen.getByText('Maya Torres')).toBeInTheDocument();
    expect(listPatients()).toHaveLength(3);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Maya Torres' }));
    expect(screen.queryByText('Maya Torres')).not.toBeInTheDocument();
    expect(listPatients()).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows the empty state with a New patient CTA when nothing is stored', () => {
    clearAll();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Roster />} />
          <Route path="/patient/new/edit" element={<div>NEW INTAKE ROUTE</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('No patients yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '+ New patient' })).toHaveLength(2);
    expect(screen.queryByLabelText('Search patients by name')).not.toBeInTheDocument();
  });

  it('shows a no-matches state that a non-example patient can be found through', () => {
    savePatient({ ...basePatient });
    renderRoster();

    fireEvent.change(screen.getByLabelText('Search patients by name'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search patients by name'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Search patients by name'), { target: { value: 'RIVERA' } });
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
  });

  it('renders the provider disclaimer in the footer', () => {
    renderRoster();
    expect(
      screen.getByText(
        'For use by licensed providers. Plans require clinical judgment and are not medical advice.',
      ),
    ).toBeInTheDocument();
  });
});
