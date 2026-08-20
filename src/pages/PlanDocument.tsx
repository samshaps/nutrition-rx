import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import AppBar from '../components/AppBar';
import { getPatient } from '../store/patients';
import { ACTIVITY_FACTORS, buildFoodGuidance, generatePlan } from '../engine';
import type { FoodGuidance } from '../engine';
import type {
  ActivityLevel,
  EaBand,
  EngineInput,
  Goal,
  Patient,
  PlanResult,
  RampWeek,
  SplitDay,
} from '../engine/types';
/** Icon keys for the food-tile glyphs drawn inline below. */
type GlyphIcon = 'chicken' | 'yogurt' | 'eggs' | 'whey' | 'salmon';
import './PlanDocument.css';

/**
 * The plan document — the artifact the provider prints and hands to the
 * patient. Layout is a direct port of the approved mock (mocks/mock-plan.html);
 * every number on the page comes from `PlanResult` + `Patient`.
 *
 * `PlanView` below is pure presentation: (patient, plan) in, markup out. The
 * only impure part of this file is `resolvePlan`, which calls the engine.
 */

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

const MINUS = '−';
const MIDDOT = '·';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Whole number with thousands separators. */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** One decimal place, without a trailing ".0" surprise for whole numbers. */
function fmt1(n: number): string {
  return n.toFixed(1);
}

function ageFromDob(dob: string, now = new Date()): number | null {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function heightImperial(cm: number): string {
  const totalInches = cm / 2.54;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet}′${inches}″`;
}

function lbFromKg(kg: number): number {
  return kg * 2.20462;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Percentage of TDEE, as a signed display string ("−25%", "+15%", "0%"). */
function signedPct(value: number, tdee: number): string {
  if (!isNum(tdee) || tdee <= 0) return '—';
  const pct = Math.round((value / tdee - 1) * 100);
  if (pct === 0) return '0%';
  return pct < 0 ? `${MINUS}${Math.abs(pct)}%` : `+${pct}%`;
}

function pctOfKcal(grams: number, kcalPerGram: number, totalKcal: number): number {
  if (!isNum(totalKcal) || totalKcal <= 0) return 0;
  return Math.round(((grams * kcalPerGram) / totalKcal) * 100);
}

/** Percentage for an inline width/height/offset, clamped and rounded for CSS. */
function clampPct(n: number, min = 2, max = 100): number {
  if (!isNum(n)) return min;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * Domain labels
 * ------------------------------------------------------------------ */

/** Plain-language names for the activity tiers; the factors come from the engine. */
const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: 'sedentary',
  light: 'lightly active',
  moderate: 'moderately active',
  active: 'active',
  very_active: 'very active',
};

/** The factor shown in the chain must be the one the engine multiplied by. */
function activityFor(level: ActivityLevel): { factor: number; label: string } {
  return {
    factor: ACTIVITY_FACTORS[level] ?? ACTIVITY_FACTORS.sedentary,
    label: ACTIVITY_LABEL[level] ?? ACTIVITY_LABEL.sedentary,
  };
}

const GOAL_LABEL: Record<Goal, string> = {
  lose_fat: 'Lose fat',
  gain_muscle: 'Gain muscle',
  maintain: 'Maintain',
  improve_a1c: 'Improve A1c',
};

const GOAL_RANGE_NAME: Record<Goal, string> = {
  lose_fat: 'Fat-loss range',
  gain_muscle: 'Muscle-gain range',
  maintain: 'Maintenance range',
  improve_a1c: 'A1c range',
};

/** Machine-readable macro flags → plain language for the printed sheet. */
const MACRO_FLAG_LABELS: Record<string, string> = {
  renal_protein_cap: `Protein capped at 0.8 g/kg ${MIDDOT} renal disease on file`,
  adjusted_body_weight: 'Protein set from adjusted body weight (BMI 30 or above)',
  kcal_too_low_for_macros:
    'Calorie target is too low to hold every macro floor — review before use',
  protein_dosed_by_training_volume: 'Protein dosed to weekly training volume',
};

/** Flags the provider must act on print in amber; the rest are informational. */
const CAUTION_FLAGS = new Set(['renal_protein_cap', 'kcal_too_low_for_macros']);

function macroFlagLabel(flag: string): string {
  const known = MACRO_FLAG_LABELS[flag];
  if (known) return known;
  const words = flag.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** FFM as known from the record: stored directly, or derived from body fat %. */
function ffmOf(patient: Patient): number | null {
  if (isNum(patient.ffmKg)) return patient.ffmKg;
  if (isNum(patient.bodyFatPct) && isNum(patient.weightKg)) {
    return patient.weightKg * (1 - patient.bodyFatPct / 100);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Engine call
 * ------------------------------------------------------------------ */

export function toEngineInput(patient: Patient): EngineInput {
  return {
    sex: patient.sex,
    ageYears: ageFromDob(patient.dob) ?? 40,
    heightCm: patient.heightCm,
    weightKg: patient.weightKg,
    bodyFatPct: patient.bodyFatPct,
    ffmKg: patient.ffmKg,
    measuredRmrKcal: patient.measuredRmrKcal,
    activityLevel: patient.activityLevel,
    exercise: patient.exercise ?? [],
    recall: patient.recall,
    goal: patient.goal,
    clinicalFlags: patient.clinicalFlags ?? [],
  };
}

function resolvePlan(patient: Patient): PlanResult {
  return generatePlan(toEngineInput(patient));
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function PlanDocument() {
  const { id } = useParams<{ id: string }>();
  const patient = id ? getPatient(id) : undefined;

  if (!patient) return <Navigate to="/" replace />;

  const plan = resolvePlan(patient);

  return (
    <>
      <AppBar />
      <PlanView patient={patient} plan={plan} />
    </>
  );
}

export interface PlanViewProps {
  patient: Patient;
  plan: PlanResult;
}

/** Pure presentation. Everything below renders from these two objects only. */
export function PlanView({ patient, plan }: PlanViewProps) {
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const age = ageFromDob(patient.dob);
  const ffm = ffmOf(patient);
  const preparedOn = formatDate(patient.updatedAt);

  return (
    <div className="plan-doc">
      <div className="chrome">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Patients</Link>
          <i aria-hidden="true">/</i>
          <Link to={`/patient/${patient.id}/edit`}>{fullName}</Link>
          <i aria-hidden="true">/</i>
          <span className="here">Plan</span>
        </nav>
        <div className="bar-actions">
          <Link className="btn" to={`/patient/${patient.id}/edit`}>
            Edit inputs
          </Link>
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="ground">
        <article className="sheet">
          {/* ---------------- masthead ---------------- */}
          <div className="mast">
            <div>
              <div className="eyebrow">Nutrition &amp; exercise plan</div>
              <h1>{fullName}</h1>
            </div>
            <div className="mast-right">
              Prepared <span className="date">{preparedOn}</span>
              <br />
              Review at 6-week follow-up
            </div>
          </div>

          <div className="facts">
            <Fact k="Age / Sex">
              {age !== null ? age : '—'} <em>{patient.sex === 'female' ? 'F' : 'M'}</em>
            </Fact>
            <Fact k="Height">
              {heightImperial(patient.heightCm)} <em>{Math.round(patient.heightCm)} cm</em>
            </Fact>
            <Fact k="Weight">
              {Math.round(lbFromKg(patient.weightKg))} lb <em>{patient.weightKg.toFixed(1)} kg</em>
            </Fact>
            {isNum(patient.bodyFatPct) ? (
              <Fact k="Body fat">
                {Math.round(patient.bodyFatPct)}% <em>scan</em>
              </Fact>
            ) : null}
            {isNum(patient.ffmKg) ? (
              <Fact k="Fat-free mass">
                {patient.ffmKg.toFixed(1)} <em>kg</em>
              </Fact>
            ) : null}
            <Fact k="Goal" text>
              {GOAL_LABEL[patient.goal] ?? patient.goal}
            </Fact>
          </div>

          <NutritionSection patient={patient} plan={plan} ffm={ffm} />
          <FoodSection plan={plan} />

          <div className="pagebreak" aria-hidden="true">
            <span>page 2</span>
          </div>

          <ExerciseSection plan={plan} goal={patient.goal} />
          <AtAGlance plan={plan} />

          {/* ---------------- beyond the numbers ---------------- */}
          <section className="beyond">
            <div className="beyond-k">Beyond the numbers</div>
            <p>
              These targets describe energy and food, which is only part of the picture. Stress,
              mental health, medical history, medications, and how well you sleep all affect
              metabolism and body composition, sometimes more than a calorie figure does. Your
              provider weighs those alongside this plan — bring up anything that has changed.
            </p>
          </section>

          {/* ---------------- footer ---------------- */}
          <div className="colophon">
            <div className="colophon-l">
              <div className="prepared">Prepared by your dietitian with Nutrition Rx</div>
              <p className="disclaim">
                This plan was generated with provider oversight and is not medical advice on its
                own. Bring it with you to your next visit, and contact your provider before
                changing it.
              </p>
            </div>
            <div className="colophon-r">
              {fullName.toUpperCase()}
              <br />
              {preparedOn.toUpperCase()}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function Fact({ k, text, children }: { k: string; text?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="fact-k">{k}</div>
      <div className={text ? 'fact-v is-text' : 'fact-v'}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Section 1 — nutrition targets
 * ------------------------------------------------------------------ */

const TIER_COPY: Record<
  PlanResult['rmr']['source'],
  { badge: string; tier: 1 | 2 | 3; note: string; lead: string }
> = {
  measured: {
    badge: `Measured RMR ${MIDDOT} indirect calorimetry`,
    tier: 1,
    note: 'Trust tiers, highest first. This plan sits at tier 1 — built on your own measured resting metabolic rate rather than any equation.',
    lead: 'These numbers start from your measured resting metabolism, not a population average. Here is how they were built.',
  },
  ffm: {
    badge: `Katch-McArdle ${MIDDOT} from measured FFM`,
    tier: 2,
    note: 'Trust tiers, highest first. This plan sits at tier 2 — built on your scan-measured fat-free mass rather than indirect calorimetry.',
    lead: 'These numbers come from your measured body composition, not a population average. Here is how they were built.',
  },
  population: {
    badge: `Mifflin-St Jeor ${MIDDOT} population estimate`,
    tier: 3,
    note: 'Trust tiers, highest first. This plan sits at tier 3 — with no body-composition scan on file it uses a population equation, so treat the numbers as a starting point and adjust at follow-up.',
    lead: 'With no body-composition scan on file these numbers start from a population equation. Here is how they were built.',
  },
};

function NutritionSection({
  patient,
  plan,
  ffm,
}: {
  patient: Patient;
  plan: PlanResult;
  ffm: number | null;
}) {
  const activity = activityFor(patient.activityLevel);
  const tier = TIER_COPY[plan.rmr.source] ?? TIER_COPY.population;
  const macros = plan.macros;
  const flags = Array.isArray(macros.flags) ? macros.flags : [];
  const recall = patient.recall;
  const hasRecall = !!recall && (isNum(recall.calories) || isNum(recall.proteinG));

  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-num">1</span>
        <h2>Nutrition targets</h2>
      </div>
      <p className="sec-lead">{tier.lead}</p>

      {/* derivation chain: RMR x AF + EEE = TDEE */}
      <div className="chain">
        <div className="step">
          <div className="step-k">Resting metabolic rate</div>
          <div className="step-v">
            {fmt(plan.rmr.kcal)}
            <small>kcal</small>
          </div>
        </div>
        <div className="op" aria-hidden="true">
          &times;
        </div>
        <div className="step">
          <div className="step-k">Daily activity factor</div>
          <div className="step-v">
            {activity.factor}
            <small>{activity.label}</small>
          </div>
        </div>
        <div className="op" aria-hidden="true">
          +
        </div>
        <div className="step">
          <div className="step-k">Exercise energy, avg</div>
          <div className="step-v">
            {fmt(plan.eee)}
            <small>kcal/day</small>
          </div>
        </div>
        <div className="op" aria-hidden="true">
          =
        </div>
        <div className="step step--total">
          <div className="step-k">Total daily energy use</div>
          <div className="step-v">
            {fmt(plan.tdee)}
            <small>kcal</small>
          </div>
        </div>
      </div>

      <div className="badge">{tier.badge}</div>
      <div className="tiers">
        <span className={tier.tier === 1 ? 'tier tier--on' : 'tier'}>
          <b>1</b>measured RMR
        </span>
        <span className="tier-sep" aria-hidden="true">
          &rsaquo;
        </span>
        <span className={tier.tier === 2 ? 'tier tier--on' : 'tier'}>
          <b>2</b>body-comp estimate
        </span>
        <span className="tier-sep" aria-hidden="true">
          &rsaquo;
        </span>
        <span className={tier.tier === 3 ? 'tier tier--on' : 'tier'}>
          <b>3</b>population estimate
        </span>
        <span className="tier-note">{tier.note}</span>
      </div>

      {/* headline calorie target */}
      <div className="target">
        <div>
          <div className="eyebrow">Calories per day</div>
          <div className="target-num">
            {fmt(plan.target.kcal)}
            <span className="target-unit">kcal</span>
          </div>
        </div>
        <div className="target-side">
          <TargetSide goal={patient.goal} plan={plan} />
        </div>
      </div>

      {plan.target.clamped ? <ClampCallout plan={plan} patient={patient} ffm={ffm} /> : null}

      {plan.ea ? <EaMeter value={plan.ea.value} band={plan.ea.band} /> : <EaUnavailable />}

      {/* Where the 30 kcal/kg floor comes from — asked for by name at review. */}
      <p className="floor-source">
        <b>Safety floor:</b> 30 kcal per kg of fat-free mass, drawn from low-energy-availability
        (RED-S) research. The evidence base is strongest in athletes; it is used here as a
        conservative default, not a diagnosis — final thresholds are your provider&rsquo;s call.
      </p>

      {/* macros */}
      <div className="sub">Daily macronutrient targets</div>
      <div className="macros">
        <div className="macro macro--protein">
          <div className="macro-k">Protein</div>
          <div className="macro-v">
            {fmt(macros.proteinG)}
            <span>g</span>
          </div>
          <div className="macro-sub">
            {isNum(macros.proteinPerKg)
              ? `${fmt1(macros.proteinPerKg)} g per kg body weight — dosed to your training volume. `
              : 'Dosed to your training volume. '}
            The accepted range is 0.8&ndash;2.2 g/kg.
          </div>
        </div>
        <div className="macro">
          <div className="macro-k">Carbohydrate</div>
          <div className="macro-v">
            {fmt(macros.carbsG)}
            <span>g</span>
          </div>
          <div className="macro-sub">
            {pctOfKcal(macros.carbsG, 4, plan.target.kcal)}% of calories {MIDDOT} fuel for training
            days
          </div>
        </div>
        <div className="macro">
          <div className="macro-k">Fat</div>
          <div className="macro-v">
            {fmt(macros.fatG)}
            <span>g</span>
          </div>
          <div className="macro-sub">
            {isNum(patient.weightKg) && patient.weightKg > 0
              ? `${fmt1(macros.fatG / patient.weightKg)} g/kg ${MIDDOT} `
              : ''}
            {pctOfKcal(macros.fatG, 9, plan.target.kcal)}% of calories
          </div>
        </div>
        <div className="macro">
          <div className="macro-k">Fiber</div>
          <div className="macro-v">
            {fmt(macros.fiberG)}
            <span>g</span>
          </div>
          <div className="macro-sub">14 g per 1,000 kcal</div>
        </div>
      </div>

      {flags.length > 0 ? (
        <div className="macro-flags">
          {flags.map((f) => (
            <span
              className={CAUTION_FLAGS.has(f) ? 'flagchip flagchip--warn' : 'flagchip'}
              key={f}
            >
              {macroFlagLabel(f)}
            </span>
          ))}
        </div>
      ) : null}

      {hasRecall ? <Gaps recall={recall!} plan={plan} /> : null}
    </div>
  );
}

function TargetSide({ goal, plan }: { goal: Goal; plan: PlanResult }) {
  const { tdee, target } = plan;
  const [lo, hi] = target.range;
  const selected = target.clamped ? target.clamped.originalTarget : target.kcal;
  const floorName =
    target.clamped?.clampedBy === 'rmr_floor'
      ? 'below resting metabolic rate'
      : 'below the energy-availability floor';

  if (goal === 'maintain') {
    return (
      <>
        Maintenance holds calories at daily energy use — <b>{fmt(target.kcal)} kcal</b>. The band
        worth staying inside is <b>{fmt(lo)}</b>–<b>{fmt(hi)} kcal</b>.
        {target.clamped ? <> The target was raised to clear the safety floor.</> : null}
      </>
    );
  }

  // Deficits read from the smaller cut to the larger one (−15% to −25%);
  // surpluses read the other way (+10% to +20%).
  const [pctFirst, pctSecond] = lo > tdee ? [lo, hi] : [hi, lo];

  return (
    <>
      {GOAL_RANGE_NAME[goal] ?? 'Goal range'} is{' '}
      <b>
        {signedPct(pctFirst, tdee)} to {signedPct(pctSecond, tdee)}
      </b>{' '}
      of daily energy use ({fmt(lo)}–{fmt(hi)} kcal). Your provider selected{' '}
      <b>{signedPct(selected, tdee)}</b>, which lands at {fmt(selected)} kcal
      {target.clamped ? (
        <>
          {' '}
          — <b>{floorName}</b>, so the target was raised.
        </>
      ) : (
        <>.</>
      )}
    </>
  );
}

function ClampCallout({
  plan,
  patient,
  ffm,
}: {
  plan: PlanResult;
  patient: Patient;
  ffm: number | null;
}) {
  const clamp = plan.target.clamped!;
  const original = clamp.originalTarget;
  const final = plan.target.kcal;
  const isEa = clamp.clampedBy === 'ea_floor';
  /** EA the goal target would have produced — computed here, for display only. */
  const wouldBeEa = isEa && ffm && ffm > 0 ? (original - plan.eee) / ffm : null;
  const deficitWord = patient.goal === 'gain_muscle' ? 'surplus' : 'deficit';

  return (
    <div className="clamp">
      <div className="clamp-tag">Safety floor applied</div>
      {isEa ? (
        <p className="clamp-say">
          {fmt(original)} kcal would leave{' '}
          {wouldBeEa !== null ? (
            <b>{fmt1(wouldBeEa)} kcal per kg of lean mass</b>
          ) : (
            <b>too little energy per kg of lean mass</b>
          )}{' '}
          after training is paid for — below the <b>30 kcal/kg</b> safety floor. Target raised to{' '}
          <b>{fmt(final)} kcal</b>.
        </p>
      ) : (
        <p className="clamp-say">
          {fmt(original)} kcal is <b>below resting metabolic rate</b> — the{' '}
          <b>{fmt(clamp.floorValue)} kcal</b> the body uses at complete rest, before any activity
          at all. Target raised to <b>{fmt(final)} kcal</b>.
        </p>
      )}

      <div className="swap">
        <span className="swap-lab">
          Goal {deficitWord} {signedPct(original, plan.tdee)}
        </span>
        <span className="swap-from">{fmt(original)} kcal</span>
        <span className="swap-arrow" aria-hidden="true">
          &rarr;
        </span>
        <span className="swap-to">{fmt(final)} kcal</span>
        <span className="swap-lab">prescribed</span>
      </div>

      {isEa && ffm && ffm > 0 ? (
        <div className="eq">
          <Term op>(</Term>
          <Term k="target">{fmt(final)}</Term>
          <Term op>{MINUS}</Term>
          <Term k="exercise">{fmt(plan.eee)}</Term>
          <Term op>)</Term>
          <Term op>&divide;</Term>
          <Term k="kg lean mass">{fmt1(ffm)}</Term>
          <Term op>=</Term>
          <Term k="kcal/kg" out>
            {fmt1((final - plan.eee) / ffm)}
          </Term>
        </div>
      ) : (
        <div className="eq">
          <Term k="goal target">{fmt(original)}</Term>
          <Term op>&lt;</Term>
          <Term k="floor">{fmt(clamp.floorValue)}</Term>
          <Term op>&rarr;</Term>
          <Term k="prescribed" out>
            {fmt(final)}
          </Term>
        </div>
      )}
    </div>
  );
}

function Term({
  children,
  k,
  op,
  out,
}: {
  children: ReactNode;
  k?: string;
  op?: boolean;
  out?: boolean;
}) {
  const cls = ['term', op ? 'term--op' : '', out ? 'term--out' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="term-v">{children}</div>
      <div className="term-k">{k ?? ' '}</div>
    </div>
  );
}

/** Meter scale: 0–60 kcal/kg, so 30 sits at 50% and 45 at 75% (mock geometry). */
const EA_SCALE_MAX = 60;

function EaMeter({ value, band }: { value: number; band: EaBand }) {
  const left = clampPct((value / EA_SCALE_MAX) * 100, 3, 97);
  const atFloor = Math.abs(value - 30) < 0.5;

  const descriptor =
    band === 'low'
      ? `below the 30 kcal/kg floor ${MIDDOT} low band`
      : band === 'optimal'
        ? `optimal band`
        : atFloor
          ? `at the floor ${MIDDOT} reduced band`
          : `reduced band`;

  const note =
    band === 'low'
      ? 'This is the fuel left for everything your body does outside of exercise — hormones, bone, immune function, recovery. Below 30 kcal/kg those systems are the first to give way. This plan needs close supervision, and the target should come up at follow-up.'
      : band === 'optimal'
        ? 'This is the fuel left for everything your body does outside of exercise — hormones, bone, immune function, recovery. There is comfortable room at this level. Recheck at follow-up if training volume climbs.'
        : 'This is the fuel left for everything your body does outside of exercise — hormones, bone, immune function, recovery. Sitting near 30 is safe for a supervised phase, but it is not a place to stay indefinitely. Recheck at follow-up.';

  return (
    <div className="ea">
      <div className="ea-top">
        <div className="eyebrow">Energy availability</div>
        <div className="ea-val">
          {fmt1(value)} kcal/kg FFM <em>{descriptor}</em>
        </div>
      </div>
      <div className="meter">
        <div className="meter-bands">
          <div className="band band--low">
            <span className="band-fill" />
          </div>
          <div className="band band--red">
            <span className="band-fill" />
          </div>
          <div className="band band--opt">
            <span className="band-fill" />
          </div>
        </div>
        <div className="marker" style={{ left: `${left}%` }}>
          <span className="marker-lab">{fmt1(value)}</span>
        </div>
      </div>
      <div className="meter-legend">
        <div className="leg leg--low">
          <b>Low</b>under 30
        </div>
        <div className="leg leg--red">
          <b>Reduced</b>30&ndash;45
        </div>
        <div className="leg leg--opt">
          <b>Optimal</b>45 and up
        </div>
      </div>
      <p className="ea-note">{note}</p>
    </div>
  );
}

function EaUnavailable() {
  return (
    <div className="ea-missing">
      <div className="clamp-tag">Energy-availability check unavailable</div>
      <p>
        No body-composition data is on file, so the energy-availability floor could not be checked.
        These targets use population estimates — interpret them conservatively, and add a
        body-composition scan before making the numbers more aggressive.
      </p>
    </div>
  );
}

function Gaps({ recall, plan }: { recall: NonNullable<Patient['recall']>; plan: PlanResult }) {
  const targetKcal = plan.target.kcal;
  const targetProtein = plan.macros.proteinG;
  const nowKcal = isNum(recall.calories) ? recall.calories : null;
  const nowProtein = isNum(recall.proteinG) ? recall.proteinG : null;

  const kcalDiff = nowKcal !== null ? Math.round(targetKcal - nowKcal) : 0;
  const proteinDiff = nowProtein !== null ? Math.round(targetProtein - nowProtein) : 0;
  const proteinPct =
    nowProtein !== null && targetProtein > 0 ? Math.round((nowProtein / targetProtein) * 100) : 0;

  return (
    <>
      <div className="sub">Where you are today</div>
      <p className="recall-note">From the 24-hour recall recorded at intake.</p>
      <div className="gaps">
        {nowKcal !== null ? (
          <div className="gap">
            <div className="gap-head">
              <span className="gap-name">Calories</span>
              <span className="gap-nums">
                <b>{fmt(nowKcal)}</b> now {MIDDOT} target {fmt(targetKcal)}
              </span>
            </div>
            <div className="track">
              <span
                className="fill"
                style={{ width: `${clampPct((nowKcal / targetKcal) * 100)}%` }}
              />
            </div>
            <div className="gap-foot">
              {kcalDiff > 25
                ? `You are eating about ${fmt(kcalDiff)} kcal less than your plan asks for. Under-eating is the more common problem here, not over-eating.`
                : kcalDiff < -25
                  ? `You are eating about ${fmt(Math.abs(kcalDiff))} kcal more than your plan asks for — most of the change is in what the calories are made of, not the total.`
                  : 'You are already within about a snack of the target. The composition below is what changes, not the total.'}
            </div>
          </div>
        ) : null}

        {nowProtein !== null ? (
          <div className="gap gap--key">
            <div className="gap-head">
              <span className="gap-name">Protein</span>
              <span className="gap-nums">
                <b>{fmt(nowProtein)} g</b> now {MIDDOT} target {fmt(targetProtein)} g
              </span>
            </div>
            <div className="track">
              <span
                className="fill"
                style={{ width: `${clampPct((nowProtein / targetProtein) * 100)}%` }}
              />
            </div>
            <div className="gap-flag">
              {proteinDiff > 0 ? (
                <>
                  Add <b>+{fmt(proteinDiff)} g</b> of protein a day. This is the single biggest
                  change in the plan — today you are at roughly {proteinPct}% of target.
                </>
              ) : (
                <>
                  You are already at the protein target — <b>{proteinPct}%</b> of it. Hold it there
                  while the calories move.
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Closing summary — "At a glance"
 * ------------------------------------------------------------------ *
 * Four patient-readable tiles at the end of the document. Same numbers as
 * above, nothing new: the whole plan reduced to what to remember.
 */

const BAND_WORD: Record<EaBand, string> = {
  low: 'Low',
  reduced: 'Reduced',
  optimal: 'Optimal',
};

function AtAGlance({ plan }: { plan: PlanResult }) {
  const rx = plan.exercise;
  const ramp = Array.isArray(rx.rampWeeks)
    ? rx.rampWeeks.filter((w) => w && isNum(w.cardioMinutes))
    : [];
  const first = ramp.length ? ramp[0].cardioMinutes : rx.cardioMinutesPerWeek;
  const last = ramp.length ? ramp[ramp.length - 1].cardioMinutes : rx.cardioMinutesPerWeek;
  const cardioPhrase =
    first !== last
      ? `build to ${fmt(last)} min cardio/wk`
      : `${fmt(rx.cardioMinutesPerWeek)} min cardio/wk`;

  return (
    <section className="glance" aria-label="At a glance">
      <div className="glance-head">At a glance</div>
      <div className="glance-row">
        <div className="gl">
          <div className="gl-k">Energy availability</div>
          {plan.ea ? (
            <>
              <div className="gl-v">
                {fmt1(plan.ea.value)}
                <span>kcal/kg</span>
              </div>
              <div className="gl-t">{BAND_WORD[plan.ea.band] ?? plan.ea.band} band</div>
            </>
          ) : (
            <>
              <div className="gl-v gl-v--text">Not assessed</div>
              <div className="gl-t">No body-composition data</div>
            </>
          )}
        </div>
        <div className="gl">
          <div className="gl-k">Calories</div>
          <div className="gl-v">
            {fmt(plan.target.kcal)}
            <span>kcal</span>
          </div>
          <div className="gl-t">per day</div>
        </div>
        <div className="gl">
          <div className="gl-k">Protein</div>
          <div className="gl-v">
            {fmt(plan.macros.proteinG)}
            <span>g</span>
          </div>
          <div className="gl-t">per day</div>
        </div>
        <div className="gl">
          <div className="gl-k">Exercise</div>
          <div className="gl-v gl-v--text">
            {fmt(rx.resistanceDaysPerWeek)}&times; lifting
          </div>
          <div className="gl-t">{cardioPhrase}</div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Section 2 — food guidance
 * ------------------------------------------------------------------ */

const GLYPHS: Record<GlyphIcon, ReactNode> = {
  chicken: (
    <>
      <path d="M11 24c0-8 6-14 14-14 6 0 10 4 10 9 0 3-2 5-2 8 0 5-5 9-11 9s-11-4-11-12z" />
      <path d="M17 18c2-2 5-3 8-2.5" />
    </>
  ),
  yogurt: (
    <>
      <path d="M13 15h18l-2.2 18.2a2 2 0 0 1-2 1.8H17.2a2 2 0 0 1-2-1.8z" />
      <path d="M11 10.5h22V15H11z" />
      <path d="M18 22h8" />
    </>
  ),
  eggs: (
    <>
      <ellipse cx="17.5" cy="26" rx="7.5" ry="9.5" />
      <ellipse cx="28" cy="19" rx="6.5" ry="8.5" />
    </>
  ),
  whey: (
    <>
      <path d="M11 26a9.5 9.5 0 0 1 19 0v3.5H11z" />
      <path d="M11 29.5h19" />
      <path d="M30 25.5l5.5-9" />
    </>
  ),
  salmon: (
    <>
      <path d="M9 24c6.5-8.5 19-12 27-8.5-1.5 8.5-11 15.5-21 14-3-.4-5-2.5-6-5.5z" />
      <path d="M17.5 17.5l3.5 8M25 15.5l3.5 7.5" />
    </>
  ),
};

/** A portion tile ready to render, from either the engine or the local library. */
interface RenderTile {
  key: string;
  name: string;
  portion: string;
  proteinG: number;
  running: number;
  icon: GlyphIcon | null;
  emoji: string | null;
}

/** Engine food labels that have a drawn glyph in the mock's icon set. */
const ICON_BY_LABEL: Record<string, GlyphIcon> = {
  'Chicken breast': 'chicken',
  Salmon: 'salmon',
  'Whey protein': 'whey',
  'Greek yogurt': 'yogurt',
  Eggs: 'eggs',
};

function resolveFoodTiles(proteinG: number): {
  tiles: RenderTile[];
  covered: number;
  guides: { carb: string; fat: string; fiber: string } | null;
} {
  const guidance: FoodGuidance = buildFoodGuidance(proteinG);
  let running = 0;
  const tiles = guidance.items.map((item, i) => {
    running += item.proteinG;
    return {
      key: `${item.label}-${i}`,
      name: item.label,
      portion: item.portion,
      proteinG: Math.round(item.proteinG),
      running: Math.round(running),
      icon: ICON_BY_LABEL[item.label] ?? null,
      emoji: item.emoji ?? null,
    };
  });
  return {
    tiles,
    covered: Math.round(guidance.totalProteinG ?? running),
    guides: {
      carb: guidance.carbGuidance,
      fat: guidance.fatGuidance,
      fiber: guidance.fiberGuidance,
    },
  };
}

function FoodSection({ plan }: { plan: PlanResult }) {
  const proteinG = plan.macros.proteinG;
  const { tiles, covered, guides } = resolveFoodTiles(proteinG);
  const remainder = Math.max(0, Math.round(proteinG - covered));

  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-num">2</span>
        <h2>Food guidance</h2>
      </div>
      <p className="sec-lead">
        This is not a meal plan and there is nothing to follow exactly. It is a picture of what
        hitting {fmt(proteinG)} g of protein physically looks like across an ordinary day.
      </p>

      <div className="sub">What {fmt(proteinG)} g of protein looks like in a day</div>
      <div className="portions">
        {tiles.map((tile) => (
          <div className="portion" key={tile.key}>
            <div className="glyph">
              {tile.icon ? (
                <svg
                  viewBox="0 0 44 44"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {GLYPHS[tile.icon]}
                </svg>
              ) : (
                <span className="glyph-emoji" aria-hidden="true">
                  {tile.emoji ?? '•'}
                </span>
              )}
            </div>
            <div className="portion-n">{tile.name}</div>
            <div className="portion-p">{tile.portion}</div>
            <div className="portion-g">
              {tile.proteinG}
              <span> g</span>
            </div>
            <div className="portion-run">{tile.running} g so far</div>
          </div>
        ))}
      </div>
      <div className="portion-total">
        <span className="pt-v">&asymp; {covered} g</span>
        <span className="pt-t">
          {remainder > 0 ? (
            <>
              Everyday foods — bread, milk, beans, oats, vegetables — cover the remaining ~
              {remainder} g without any effort.{' '}
            </>
          ) : null}
          You do not need all of these on the same day; swap freely between them.
        </span>
      </div>

      <div className="guides">
        <div className="guide">
          <div className="guide-k">
            <em>Carbohydrate</em>
            {fmt(plan.macros.carbsG)} g
          </div>
          <div className="guide-t">
            {guides?.carb ??
              'Anchor carbs to training days. A cupped handful of rice, potato, or oats at the meal before and the meal after lifting covers most of it.'}
          </div>
        </div>
        <div className="guide">
          <div className="guide-k">
            <em>Fat</em>
            {fmt(plan.macros.fatG)} g
          </div>
          <div className="guide-t">
            {guides?.fat ??
              'Roughly two tablespoons of olive oil plus a small handful of nuts, on top of the fat already in the fish and eggs above. Do not cut fat further to make room for carbs.'}
          </div>
        </div>
        <div className="guide">
          <div className="guide-k">
            <em>Fiber</em>
            {fmt(plan.macros.fiberG)} g
          </div>
          <div className="guide-t">
            {guides?.fiber ??
              `Half your plate vegetables at two meals, plus one serving of beans, lentils, or berries, covers most of the ${fmt(plan.macros.fiberG)} g target.`}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Section 3 — exercise prescription
 * ------------------------------------------------------------------ */

function dayKind(activity: string): string {
  const a = (activity ?? '').toLowerCase();
  if (/\brest\b|off day|recovery/.test(a)) return 'day day--rest';
  if (/lift|resist|strength|weights/.test(a)) return 'day day--lift';
  return 'day';
}

/** Split "Brisk walk 30 min" into a label and a mono duration sub-line. */
function splitActivity(activity: string): { main: string; detail: string | null } {
  const text = (activity ?? '').trim();
  const m = text.match(/^(.*?)[\s,+·–-]*(\d+\s*(?:min|minutes)\b.*)$/i);
  if (m && m[1].trim()) {
    return { main: m[1].trim().replace(/[\s,+·–-]+$/, ''), detail: m[2].trim() };
  }
  return { main: text, detail: null };
}

const RESISTANCE_WHY: Record<Goal, string> = {
  lose_fat: 'This is the work that protects lean mass while calories are restricted.',
  gain_muscle: 'This is the stimulus new muscle is built from — progress load or reps over time.',
  maintain: 'This is what keeps the lean mass and strength you already have.',
  improve_a1c:
    'Muscle is where glucose goes after a meal — this is the work that makes that happen.',
};

function ExerciseSection({ plan, goal }: { plan: PlanResult; goal: Goal }) {
  const rx = plan.exercise;
  const ramp: RampWeek[] = Array.isArray(rx.rampWeeks)
    ? rx.rampWeeks.filter((w) => w && isNum(w.cardioMinutes))
    : [];
  const split: SplitDay[] = Array.isArray(rx.split) ? rx.split.filter((d) => d && d.day) : [];
  const notes = Array.isArray(rx.notes) ? rx.notes.filter(Boolean) : [];

  const maxMinutes = ramp.reduce((m, w) => Math.max(m, w.cardioMinutes), 0);
  const first = ramp.length ? ramp[0].cardioMinutes : rx.cardioMinutesPerWeek;
  const last = ramp.length ? ramp[ramp.length - 1].cardioMinutes : rx.cardioMinutesPerWeek;
  const perWeekStep =
    ramp.length > 1 ? Math.round((last - first) / (ramp.length - 1) / 5) * 5 : 0;
  const liftDays = split.filter((d) => dayKind(d.activity).includes('lift')).length;

  return (
    <div className="sec sec--break">
      <div className="sec-head">
        <span className="sec-num">3</span>
        <h2>Exercise prescription</h2>
      </div>
      <p className="sec-lead">
        The training builds from where you are now — not from where we want to end up.{' '}
        {fmt(rx.resistanceDaysPerWeek)} resistance sessions a week
        {first !== last
          ? `, with cardio volume ramped over ${ramp.length || 4} weeks.`
          : `, with cardio held at ${fmt(rx.cardioMinutesPerWeek)} minutes a week.`}
      </p>

      <div className="rx">
        <div className="rx-card">
          <div className="rx-k">Resistance training</div>
          <div className="rx-v">
            {fmt(rx.resistanceDaysPerWeek)}
            <span>&times; per week</span>
          </div>
          <div className="rx-t">
            {RESISTANCE_WHY[goal] ?? RESISTANCE_WHY.maintain}
            {liftDays > 0 ? ` Laid out on ${liftDays} days in the split below.` : ''}
          </div>
        </div>
        <div className="rx-card">
          <div className="rx-k">Moderate cardio</div>
          <div className="rx-v">
            {first !== last ? (
              <>
                {fmt(first)} &rarr; {fmt(last)}
              </>
            ) : (
              fmt(rx.cardioMinutesPerWeek)
            )}
            <span>min / week</span>
          </div>
          <div className="rx-t">
            {first !== last
              ? `Built up over ${ramp.length || 4} weeks. `
              : 'Steady at your current volume for now. '}
            Brisk walking counts; you should be able to talk but not sing.
          </div>
        </div>
      </div>

      {ramp.length > 0 ? (
        <>
          <div className="sub">
            {first !== last
              ? `${ramp.length}-week ramp — start where you are`
              : 'Weekly cardio volume — steady for now'}
          </div>
          <div
            className="ramp"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, ramp.length)}, 1fr)` }}
          >
            {ramp.map((w, i) => {
              const height = maxMinutes > 0 ? (w.cardioMinutes / maxMinutes) * 100 : 100;
              const opacity = 0.4 + (0.6 * (i + 1)) / ramp.length;
              return (
                <div className="wk" key={w.week ?? i}>
                  <div className="wk-bar">
                    <i style={{ height: `${clampPct(height, 6, 100)}%`, opacity }} />
                  </div>
                  <div className="wk-v">
                    {fmt(w.cardioMinutes)}
                    <span>min/wk</span>
                  </div>
                  <div className="wk-k">Week {w.week ?? i + 1}</div>
                </div>
              );
            })}
          </div>
          {perWeekStep > 0 ? (
            <p className="split-note">
              Week 1 matches roughly what you are already doing. Each week adds about{' '}
              {perWeekStep} minutes — one extra walk, or a few more minutes on the walks you
              already take.
            </p>
          ) : null}
        </>
      ) : null}

      {split.length > 0 ? (
        <>
          <div className="sub">
            Proposed weekly split{ramp.length ? ` — week ${ramp[ramp.length - 1].week} shown` : ''}
          </div>
          <div className="split">
            {split.map((d, i) => {
              const { main, detail } = splitActivity(d.activity);
              return (
                <div className={dayKind(d.activity)} key={`${d.day}-${i}`}>
                  <div className="day-n">{d.day}</div>
                  <div className="day-a">
                    {main}
                    {detail ? <em>{detail}</em> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {notes.length > 0 ? (
        <ul className="notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
