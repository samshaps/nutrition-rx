import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppBar from '../components/AppBar';
import { deletePatient, listPatients } from '../store/patients';
import type { Goal, Patient } from '../engine/types';
import './Roster.css';

/* ------------------------------------------------------------------ *
 * Derivations — deliberately cheap. The roster never calls the engine;
 * the plan page owns the real numbers.
 * ------------------------------------------------------------------ */

const GOAL_LABELS: Record<Goal, string> = {
  lose_fat: 'Lose fat',
  gain_muscle: 'Gain muscle',
  maintain: 'Maintain',
  improve_a1c: 'Improve A1c',
};

const KG_PER_LB = 2.2046226218;

export function ageFromDob(dob: string, today: Date = new Date()): number | null {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;

  let age = today.getFullYear() - born.getFullYear();
  const monthDelta = today.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function kgToLb(kg: number): number {
  return Math.round(kg * KG_PER_LB);
}

function hasBodyComp(p: Patient): boolean {
  return typeof p.bodyFatPct === 'number' || typeof p.ffmKg === 'number';
}

interface SourceBadge {
  label: string;
  estimated: boolean;
}

/**
 * Which RMR tier the plan will use, mirroring the engine's precedence
 * (measured > FFM/Katch-McArdle > Mifflin) without importing it.
 */
export function rmrSourceBadge(p: Patient): SourceBadge {
  if (typeof p.measuredRmrKcal === 'number') return { label: 'Measured RMR', estimated: false };
  if (hasBodyComp(p)) return { label: 'InBody · FFM', estimated: false };
  return { label: 'Estimated · Mifflin', estimated: true };
}

interface StatusChip {
  label: string;
  tone: 'warn' | 'neutral';
}

/**
 * A coarse, engine-free read of the energy-availability situation. The plan
 * document shows the real EA value and any clamp; this is only a signal that
 * the check is (or is not) available for this patient.
 */
export function statusChip(p: Patient): StatusChip {
  if (!hasBodyComp(p)) return { label: 'No body comp', tone: 'neutral' };
  if (p.goal === 'lose_fat') return { label: 'EA check active', tone: 'warn' };
  return { label: 'EA check available', tone: 'neutral' };
}

function fullName(p: Patient): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

function sexLabel(p: Patient): string {
  return p.sex === 'female' ? 'Female' : 'Male';
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ------------------------------------------------------------------ *
 * Icons (inline, from the mock)
 * ------------------------------------------------------------------ */

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="var(--muted)"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="6.2" cy="6.2" r="4.2" />
      <path d="M9.4 9.4 12.2 12.2" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="3" r="1.25" />
      <circle cx="7" cy="7" r="1.25" />
      <circle cx="7" cy="11" r="1.25" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 1.5 6.5 5 3 8.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

interface CardProps {
  patient: Patient;
  onOpen: (id: string) => void;
  onDelete: (patient: Patient) => void;
}

function PatientCard({ patient, onOpen, onDelete }: CardProps) {
  const name = fullName(patient);
  const age = ageFromDob(patient.dob);
  const badge = rmrSourceBadge(patient);
  const status = statusChip(patient);

  return (
    <article
      className="nrx-card"
      role="link"
      tabIndex={0}
      aria-label={`Open plan for ${name}`}
      onClick={() => onOpen(patient.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(patient.id);
        }
      }}
    >
      <div className="nrx-card-top">
        <div className="nrx-name-wrap">
          <h2 className="nrx-name">{name}</h2>
          <span className="nrx-demo">
            {age === null ? sexLabel(patient) : `${age} · ${sexLabel(patient)}`}
          </span>
        </div>
        <button
          className="nrx-menu"
          type="button"
          aria-label={`Delete ${name}`}
          title="Delete patient"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(patient);
          }}
        >
          <MenuIcon />
        </button>
      </div>

      <div className="chip-row">
        <span className="chip chip-goal">{GOAL_LABELS[patient.goal]}</span>
        {patient.isExample ? <span className="chip chip-example">Example</span> : null}
      </div>

      <div className="nrx-stats">
        <div className="nrx-stat">
          <span className="nrx-stat-label">Weight</span>
          <span className="nrx-stat-value">
            {kgToLb(patient.weightKg)} <span className="nrx-unit">lb</span>
          </span>
        </div>
        <div className="nrx-stat">
          <span className="nrx-stat-label">RMR source</span>
          <span className={badge.estimated ? 'nrx-badge-src nrx-badge-src-est' : 'nrx-badge-src'}>
            {badge.label}
          </span>
        </div>
      </div>

      <div className="chip-row">
        <span className={status.tone === 'warn' ? 'chip chip-warn' : 'chip'}>
          {status.tone === 'warn' ? <span className="chip-dot" /> : null}
          {status.label}
        </span>
      </div>

      <div className="nrx-card-foot">
        <span className="nrx-updated">Updated {formatUpdated(patient.updatedAt)}</span>
        <span className="nrx-open">
          Open plan
          <ChevronIcon />
        </span>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function Roster() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setPatients(listPatients());
  }, []);

  const newPatient = useCallback(() => navigate('/patient/new/edit'), [navigate]);
  const openPlan = useCallback((id: string) => navigate(`/patient/${id}/plan`), [navigate]);

  const handleDelete = useCallback((patient: Patient) => {
    const confirmed = window.confirm(
      `Delete ${fullName(patient)}? This removes the record from this browser and cannot be undone.`,
    );
    if (!confirmed) return;
    deletePatient(patient.id);
    setPatients(listPatients());
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => fullName(p).toLowerCase().includes(q));
  }, [patients, query]);

  const isEmpty = patients.length === 0;

  return (
    <div className="nrx-roster">
      <AppBar
        actions={
          <button className="btn-primary" type="button" onClick={newPatient}>
            + New patient
          </button>
        }
      />

      <main className="nrx-main">
        <div className="nrx-pagehead">
          <div className="nrx-title-wrap">
            <h1 className="nrx-h1">Patients</h1>
            <span className="nrx-count">{visible.length}</span>
          </div>

          {isEmpty ? null : (
            <div className="nrx-search">
              <SearchIcon />
              <input
                className="nrx-search-input"
                type="text"
                placeholder="Search by name"
                aria-label="Search patients by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
        </div>

        {isEmpty ? (
          <div className="nrx-empty">
            <h2 className="nrx-empty-title">No patients yet</h2>
            <p className="nrx-empty-note">
              Add a patient to generate a nutrition and exercise plan. Everything you enter stays in
              this browser.
            </p>
            <button className="btn-primary" type="button" onClick={newPatient}>
              + New patient
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="nrx-empty">
            <h2 className="nrx-empty-title">No matches</h2>
            <p className="nrx-empty-note">
              No patient name matches “{query.trim()}”. Clear the search to see everyone.
            </p>
          </div>
        ) : (
          <div className="nrx-grid">
            {visible.map((p) => (
              <PatientCard key={p.id} patient={p} onOpen={openPlan} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      <footer className="nrx-footer">
        <div className="nrx-footer-inner">
          For use by licensed providers. Plans require clinical judgment and are not medical advice.
        </div>
      </footer>
    </div>
  );
}
