import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PlanDocument, { PlanView, toEngineInput } from '../PlanDocument';
import { PLAN_FIXTURE, buildPortionTiles } from '../planFixture';
import { buildFoodGuidance, generatePlan } from '../../engine';
import { clearAll, ensureSeeds } from '../../store/patients';
import { SEED_PATIENTS } from '../../store/seeds';
import type { Patient, PlanResult } from '../../engine/types';

const MAYA: Patient = SEED_PATIENTS.find((p) => p.id === 'seed-maya-torres-0001')!;
const DEVON: Patient = SEED_PATIENTS.find((p) => p.id === 'seed-devon-park-0003')!;

function renderPlan(patient: Patient, plan: PlanResult = PLAN_FIXTURE) {
  return render(
    <MemoryRouter>
      <PlanView patient={patient} plan={plan} />
    </MemoryRouter>,
  );
}

/** Whole-sheet text, whitespace-normalized — copy is split across elements. */
function sheetText(container: HTMLElement): string {
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

describe('PlanView — patient facts', () => {
  it('shows imperial units for a metric record', () => {
    const { container } = renderPlan(MAYA);
    const text = sheetText(container);
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Torres' })).toBeInTheDocument();
    expect(text).toContain('5′6″');
    expect(text).toContain('165 lb');
    expect(text).toContain('74.8 kg');
    expect(text).toContain('50.9');
    expect(text).toContain('Lose fat');
  });

  it('omits the body-composition facts when no scan is on file', () => {
    const { container } = renderPlan(DEVON);
    expect(sheetText(container)).not.toContain('Fat-free mass');
  });
});

describe('PlanView — derivation and targets', () => {
  it('renders the RMR x AF + EEE = TDEE chain with the tier badge', () => {
    const { container } = renderPlan(MAYA);
    const text = sheetText(container);
    expect(text).toContain('1,469');
    expect(text).toContain('1.375');
    expect(text).toContain('214');
    expect(text).toContain('2,234');
    expect(text).toContain('Katch-McArdle · from measured FFM');
    expect(container.querySelector('.tier--on')?.textContent).toContain('body-comp estimate');
  });

  it('renders the headline target and the clamp callout with the reason', () => {
    const { container } = renderPlan(MAYA);
    const text = sheetText(container);
    expect(container.querySelector('.target-num')?.textContent).toContain('1,750');
    expect(container.querySelector('.swap-from')?.textContent).toBe('1,680 kcal');
    expect(container.querySelector('.swap-to')?.textContent).toBe('1,750 kcal');
    // (1680 - 214) / 50.9 = 28.8 kcal/kg — computed for display only.
    expect(text).toContain('28.8 kcal per kg of lean mass');
    expect(text).toContain('30 kcal/kg');
    expect(text).toContain('Target raised to 1,750 kcal');
  });

  it('places the EA marker on the 0-60 scale and cites the floor source', () => {
    const { container } = renderPlan(MAYA);
    const marker = container.querySelector<HTMLElement>('.marker');
    expect(marker?.style.left).toBe('50.33%');
    expect(container.querySelector('.marker-lab')?.textContent).toBe('30.2');
    expect(sheetText(container)).toContain('reduced band');
    expect(sheetText(container)).toContain(
      'Safety floor: 30 kcal per kg of fat-free mass, drawn from low-energy-availability (RED-S) research',
    );
  });

  it('degrades to the caution note when EA is unavailable', () => {
    const noEa: PlanResult = { ...PLAN_FIXTURE, ea: null };
    const { container } = renderPlan(DEVON, noEa);
    const text = sheetText(container);
    expect(text).toContain('Energy-availability check unavailable');
    expect(text).toContain('interpret them conservatively');
    expect(container.querySelector('.meter')).toBeNull();
  });

  it('renders macros protein-first with the per-kg subline and flag chips', () => {
    const flagged: PlanResult = {
      ...PLAN_FIXTURE,
      macros: { ...PLAN_FIXTURE.macros, flags: ['renal_protein_cap'] },
    };
    const { container } = renderPlan(MAYA, flagged);
    const protein = container.querySelector('.macro--protein');
    expect(protein?.textContent).toContain('150');
    expect(protein?.textContent).toContain('2.0 g per kg body weight');
    expect(protein?.textContent).toContain('dosed to your training volume');
    const chip = container.querySelector('.flagchip');
    expect(chip?.textContent).toContain('Protein capped at 0.8');
    expect(chip?.className).toContain('flagchip--warn');
  });

  it('renders informational macro flags as neutral chips', () => {
    const informational: PlanResult = {
      ...PLAN_FIXTURE,
      macros: { ...PLAN_FIXTURE.macros, flags: ['protein_dosed_by_training_volume'] },
    };
    const { container } = renderPlan(MAYA, informational);
    const chip = container.querySelector('.flagchip');
    expect(chip?.textContent).toBe('Protein dosed to weekly training volume');
    expect(chip?.className).not.toContain('flagchip--warn');
  });

  it('draws current-vs-target gap bars from the 24-hour recall', () => {
    const { container } = renderPlan(MAYA);
    const text = sheetText(container);
    expect(text).toContain('1,430');
    expect(text).toContain('68 g');
    expect(text).toContain('Add +82 g');
    const fills = container.querySelectorAll<HTMLElement>('.fill');
    expect(fills).toHaveLength(2);
    expect(fills[0].style.width).toBe('81.71%'); // 1430 / 1750
  });

  it('drops the gap section when there is no recall', () => {
    const { container } = renderPlan({ ...MAYA, recall: undefined });
    expect(sheetText(container)).not.toContain('Where you are today');
  });
});

describe('PlanView — food guidance', () => {
  it('renders the engine portion equivalents with plain running totals', () => {
    const { container } = renderPlan(MAYA);
    const guidance = buildFoodGuidance(PLAN_FIXTURE.macros.proteinG);
    const tiles = container.querySelectorAll('.portion');
    expect(tiles).toHaveLength(guidance.items.length);
    expect(sheetText(container)).toContain('What 150 g of protein looks like in a day');
    expect(tiles[0].textContent).toContain(guidance.items[0].label);
    expect(tiles[0].textContent).toContain(guidance.items[0].portion);
    expect(container.querySelector('.portion-run')?.textContent).toMatch(/^\d+ g so far$/);
    expect(sheetText(container)).not.toContain('running 5');
    // Non-protein guidance lines come from the engine too.
    expect(sheetText(container)).toContain(guidance.carbGuidance);
    expect(sheetText(container)).toContain(guidance.fiberGuidance);
  });

  it('keeps a local portion library as the fallback when the engine cannot help', () => {
    const small = buildPortionTiles(150);
    const big = buildPortionTiles(220);
    const total = (t: ReturnType<typeof buildPortionTiles>) => t[t.length - 1].running;
    expect(small).toHaveLength(5);
    expect(total(big)).toBeGreaterThan(total(small));
    expect(big[0].portion).toBe('9 oz, cooked');
  });
});

describe('PlanView — exercise and summary', () => {
  it('renders the ramp, the split grid and the engine notes', () => {
    const { container } = renderPlan(MAYA);
    const text = sheetText(container);
    expect(container.querySelectorAll('.wk')).toHaveLength(4);
    expect(text).toContain('60');
    expect(text).toContain('200');
    const days = container.querySelectorAll('.day');
    expect(days).toHaveLength(7);
    expect(days[0].className).toContain('day--lift');
    expect(days[6].className).toContain('day--rest');
    expect(days[0].textContent).toContain('Resistance training');
    expect(days[0].querySelector('em')?.textContent).toBe('50 min moderate cardio');
    // A cardio-only day has no separate label, so it renders without a sub-line.
    expect(days[2].querySelector('em')).toBeNull();
    expect(container.querySelectorAll('.notes li')).toHaveLength(3);
  });

  it('closes with the four At a glance tiles', () => {
    const { container } = renderPlan(MAYA);
    const tiles = container.querySelectorAll('.glance .gl');
    expect(tiles).toHaveLength(4);
    expect(tiles[0].textContent).toContain('30.2');
    expect(tiles[0].textContent).toContain('Reduced band');
    expect(tiles[1].textContent).toContain('1,750');
    expect(tiles[2].textContent).toContain('150');
    expect(tiles[3].textContent).toContain('4× lifting');
    expect(tiles[3].textContent).toContain('build to 200 min cardio/wk');
  });

  it('closes with the beyond-the-numbers note above the disclaimer', () => {
    const { container } = renderPlan(MAYA);
    const beyond = container.querySelector('.beyond');
    expect(beyond?.textContent).toContain('Beyond the numbers');
    expect(beyond?.textContent).toContain('Stress, mental health, medical history');
    expect(beyond?.textContent).toContain('sleep');
    // Order: at a glance -> beyond -> colophon.
    const blocks = Array.from(container.querySelectorAll('.glance, .beyond, .colophon')).map(
      (el) => el.className,
    );
    expect(blocks).toEqual(['glance', 'beyond', 'colophon']);
  });

  it('parses split activities into a label and a duration sub-line', () => {
    const withCombo: PlanResult = {
      ...PLAN_FIXTURE,
      exercise: {
        ...PLAN_FIXTURE.exercise,
        split: [{ day: 'Mon', activity: 'Resistance training + 50 min moderate cardio' }],
      },
    };
    const { container } = renderPlan(MAYA, withCombo);
    const day = container.querySelector('.day');
    expect(day?.className).toContain('day--lift');
    expect(day?.querySelector('.day-a')?.firstChild?.textContent).toBe('Resistance training');
    expect(day?.querySelector('em')?.textContent).toBe('50 min moderate cardio');
  });

  it('says Not assessed in the summary when EA is unavailable', () => {
    const { container } = renderPlan(DEVON, { ...PLAN_FIXTURE, ea: null });
    expect(container.querySelector('.glance .gl')?.textContent).toContain('Not assessed');
  });
});

describe('PlanDocument route', () => {
  beforeEach(() => {
    clearAll();
    ensureSeeds();
  });

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>roster stub</div>} />
          <Route path="/patient/:id/plan" element={<PlanDocument />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders a plan for a known patient from the live engine', () => {
    const { container } = renderAt('/patient/seed-maya-torres-0001/plan');
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Torres' })).toBeInTheDocument();
    expect(container.querySelector('.crumbs')?.textContent).toContain('Patients');

    // Numbers on the page must be the engine's, not the fixture's.
    const live = generatePlan(toEngineInput(MAYA));
    expect(container.querySelector('.target-num')?.textContent).toContain(
      live.target.kcal.toLocaleString('en-US'),
    );
    expect(container.querySelector('.wk-v')?.textContent).toContain(
      String(live.exercise.rampWeeks[0].cardioMinutes),
    );
    expect(container.querySelectorAll('.day')).toHaveLength(live.exercise.split.length);
  });

  it('redirects an unknown patient id to the roster', () => {
    renderAt('/patient/does-not-exist/plan');
    expect(screen.getByText('roster stub')).toBeInTheDocument();
  });
});

describe('engine input derivation', () => {
  it('carries every clinical field plus an age derived from dob', () => {
    const input = toEngineInput(MAYA);
    expect(input).toMatchObject({
      sex: 'female',
      heightCm: 167.6,
      weightKg: 74.8,
      bodyFatPct: 32,
      ffmKg: 50.9,
      activityLevel: 'light',
      goal: 'lose_fat',
    });
    expect(input.exercise).toHaveLength(1);
    expect(input.recall).toEqual({ calories: 1430, proteinG: 68 });
    expect(input.ageYears).toBeGreaterThanOrEqual(33);
    expect(input.ageYears).toBeLessThanOrEqual(35);
  });
});
