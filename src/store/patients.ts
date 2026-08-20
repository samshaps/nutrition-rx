import type { Patient } from '../engine/types';
import { cloneSeedPatients } from './seeds';

/**
 * localStorage repository for patients.
 *
 * Everything is stored under a single versioned key so a future migration can
 * read the old blob wholesale. Storage is ALWAYS metric (cm / kg); imperial
 * entry is a UI-layer concern.
 *
 * No PHI leaves the browser — there is no network path out of this module.
 */

export const STORAGE_KEY = 'nutrition-rx:v1';
export const STORAGE_VERSION = 1;

export interface StoreBlob {
  version: number;
  /** Set once by ensureSeeds() so demo patients are never re-inserted. */
  seeded: boolean;
  patients: Patient[];
}

function emptyBlob(): StoreBlob {
  return { version: STORAGE_VERSION, seeded: false, patients: [] };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Private-mode / disabled storage.
    return null;
  }
}

function readBlob(): StoreBlob {
  const ls = storage();
  if (!ls) return emptyBlob();

  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return emptyBlob();

  try {
    const parsed = JSON.parse(raw) as Partial<StoreBlob> | null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.patients)) {
      return emptyBlob();
    }
    return {
      version: typeof parsed.version === 'number' ? parsed.version : STORAGE_VERSION,
      seeded: parsed.seeded === true,
      patients: parsed.patients as Patient[],
    };
  } catch {
    // Corrupt blob — start clean rather than crashing the app.
    return emptyBlob();
  }
}

function writeBlob(blob: StoreBlob): void {
  const ls = storage();
  if (!ls) return;
  ls.setItem(STORAGE_KEY, JSON.stringify(blob));
}

/** All patients, most recently updated first. */
export function listPatients(): Patient[] {
  return [...readBlob().patients].sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  );
}

export function getPatient(id: string): Patient | undefined {
  return readBlob().patients.find((p) => p.id === id);
}

/**
 * Insert or replace by id. Stamps `updatedAt` (and `createdAt` on insert).
 * Returns the stored record.
 */
export function savePatient(patient: Patient): Patient {
  const blob = readBlob();
  const now = new Date().toISOString();
  const index = blob.patients.findIndex((p) => p.id === patient.id);

  const record: Patient = {
    ...patient,
    createdAt: index >= 0 ? blob.patients[index].createdAt : patient.createdAt || now,
    updatedAt: now,
  };

  if (index >= 0) {
    blob.patients[index] = record;
  } else {
    blob.patients.push(record);
  }

  writeBlob(blob);
  return record;
}

export function deletePatient(id: string): void {
  const blob = readBlob();
  const next = blob.patients.filter((p) => p.id !== id);
  if (next.length === blob.patients.length) return;
  blob.patients = next;
  writeBlob(blob);
}

/**
 * Insert the fictional demo patients exactly once. Idempotent: the `seeded`
 * flag lives in the stored blob, so a provider who deletes an example never
 * gets it back on reload.
 */
export function ensureSeeds(): void {
  const blob = readBlob();
  if (blob.seeded) return;

  const existing = new Set(blob.patients.map((p) => p.id));
  for (const seed of cloneSeedPatients()) {
    if (!existing.has(seed.id)) blob.patients.push(seed);
  }
  blob.seeded = true;
  writeBlob(blob);
}

/** Test/dev helper: wipe the whole store, including the seeded flag. */
export function clearAll(): void {
  const ls = storage();
  if (!ls) return;
  ls.removeItem(STORAGE_KEY);
}
