# Build Plan — Nutrition & Exercise Planner (Demo v1)

**Goal:** A shareable, deployed link Randee can open and use on a (fictional) patient, ASAP.
**Source spec:** `randee-nutrition-planner_prd_v1.md`. This plan operationalizes it; the PRD wins on any conflict of intent.

## Decisions made with Sam (2026-08-20)

1. **"Improve A1c" is a fourth mutually-exclusive goal**, exactly as the PRD's goal table has it (lose fat / gain muscle / maintain / improve A1c). No modifier layering in v1.
2. **24-hour recall is in**, as two optional fields (current calories, current protein). Its only job is the current-vs-target gap display on the plan document.
3. **Demo data is seeded**: three clearly-labeled fictional patients, deletable, plus a "load example" affordance on the intake form.
4. **Body-composition estimation: parked** (added, then reverted, 2026-08-20). A tape-measure (Navy method) estimate path was designed for patients without an InBody scan, but Randee's visits are often virtual — patients can't reliably self-measure — and BMI-only estimates don't interest her. **v1: body comp is scan-derived or absent.** When absent, the EA check degrades to the warning banner. The intake form still makes the absence explicit (source: "InBody / DEXA scan" vs "Not available") so the provider sees what they're giving up. Revisit if in-office use grows.

## Stack

- **Vite + React + TypeScript** single-page app. No backend, no accounts, no transmission — per the PRD's no-PHI-on-a-server position. Everything runs and persists in the browser.
- **Vanilla CSS with the token system from the approved mocks** (`mocks/` in this repo) — no Tailwind. The mocks were built as scoped CSS on shared custom properties (palette, Archivo/Source Sans 3/IBM Plex Mono); porting them directly is faster and guarantees the built app matches what was approved. Plus a dedicated print stylesheet for the plan document.
- **localStorage** persistence behind a small repository module with a versioned schema (`nutrition-rx:v1`), so a future migration is possible.
- **Vitest** for the calculation engine tests.
- **React Router** with three routes: `/` (roster), `/patient/:id/edit` (intake), `/patient/:id/plan` (plan document).
- **Deploy: Vercel** static build. The link must be publicly accessible (deployment protection off) — it contains only fictional seed data until a provider enters real data locally.

## Architecture

```
src/
  engine/          # THE PRODUCT. Pure TS, zero imports from UI or storage.
    types.ts       # PatientInput, EngineResult, etc.
    rmr.ts         # 3-tier RMR: measured > Katch-McArdle (FFM) > Mifflin-St Jeor
    tdee.ts        # activity factor + structured-exercise EEE (kept separate for EA)
    targets.ts     # goal adjustment + floors + clamping with machine-readable reasons
    macros.ts      # protein/fat/carb/fiber, renal cap + flags
    energyAvailability.ts
    exercise.ts    # weekly prescription templates by goal + progression ramp
    foodGuidance.ts# portion-equivalents library ("155g protein ≈ ...")
    index.ts       # generatePlan(input): PlanResult — single entry point
    __tests__/     # hand-worked vectors (below)
  store/           # localStorage repo: list/get/save/delete Patient, seed data
  components/      # shared UI
  pages/           # Roster, Intake, PlanDocument
```

### Data model (storage + engine input)

```ts
type Goal = 'lose_fat' | 'gain_muscle' | 'maintain' | 'improve_a1c';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
type ClinicalFlag = 'renal_disease' | 'cardiac_condition' | 'pregnancy_lactation'
                  | 'eating_disorder_history' | 'mobility_limitation' | 'glp1';

interface Patient {
  id: string;                 // crypto.randomUUID()
  firstName: string; lastName: string; dob: string; // ISO date
  sex: 'male' | 'female';
  heightCm: number; weightKg: number;
  bodyFatPct?: number;        // OR ffmKg — store one, derive the other; scan-derived only
  ffmKg?: number;
  measuredRmrKcal?: number;   // indirect calorimetry override
  activityLevel: ActivityLevel;
  exercise: { type: string; sessionsPerWeek: number; minutesPerSession: number }[];
  recall?: { calories?: number; proteinG?: number };
  goal: Goal;
  clinicalFlags: ClinicalFlag[];
  isExample?: boolean;        // seeded demo patients
  createdAt: string; updatedAt: string;
}
```

UI accepts imperial (lb, ft/in) and metric; storage is metric.

### Engine rules (from PRD — the non-negotiables)

- **RMR tiers**, in order: measured RMR → Katch-McArdle `370 + 21.6 × FFM(kg)` → Mifflin-St Jeor `10W + 6.25H − 5A + (5 | −161)`. The result carries `rmrSource: 'measured' | 'ffm' | 'population'` and the plan displays it as a trust badge.
- **Body composition is scan-derived or absent** (decision 4). Present → Katch-McArdle RMR + full EA check. Absent → Mifflin path, EA check degrades to the warning banner. No estimation paths in v1.
- **TDEE** = RMR × activity factor (1.2–1.9), with exercise energy expenditure (EEE) computed separately from structured exercise (MET-based estimate per session type) so EA can use it.
- **TDEE composition** (settled 2026-08-20): `TDEE = RMR × activity factor + EEE`. The activity factor covers occupational/daily (non-exercise) activity only; structured exercise is computed separately as EEE (gross MET × kg × hours per session, summed weekly ÷ 7; document the MET table in `tdee.ts`) and added on top. EA uses that same EEE.
- **Goal targets** per the PRD table (lose −15..−25% TDEE; gain +10..+20%; maintain; A1c −10..−20% if BMI ≥ 25 else maintain). Always show the range. Prescribed number: **lose_fat uses the aggressive end (−25%)** — the floors are the safety mechanism and clamp it back when it cuts too deep, which is the product's core story (a midpoint deficit almost never trips the EA floor, an aggressive one reliably does for the at-risk profile); flag this default for Randee to validate. Gain uses +15%, A1c uses −15% when BMI ≥ 25. Round final kcal targets to the nearest 10, macros to whole grams.
- **Floors — clamp, never silently:**
  - target ≥ RMR
  - EA = (target − EEE) / FFM ≥ 30 kcal/kg FFM (only when FFM known; warning banner when unknown)
  - When clamped, `EngineResult` includes `{ clampedBy, originalTarget, floorValue }` and the plan shows the provider *why*, with numbers. This is the product's reason to exist — it gets its own visual treatment.
- **Macros:** protein dosed by weekly structured exercise minutes, per Randee's stated practice (2026-08-20 feedback: "0.8–2 g/kg; I usually do 1:1 unless they exercise a lot, then 1.5–2"): < 90 min/wk → 1.0 g/kg, 90–179 → 1.5, ≥ 180 → 2.0; adjusted BW if BMI ≥ 30; capped at 0.8 g/kg + flag when `renal_disease`. Fat ≥ 0.6 g/kg and ≥ 20% kcal, carbs = remainder, fiber = 14 g/1000 kcal. The plan renders the chosen g/kg as "dosed to your training volume" with the accepted 0.8–2.2 range, never as a universal constant.
- **EA display:** value + band (≥45 optimal / 30–45 reduced / <30 low), with a one-line plain-language explanation.
- **Exercise templates by goal** (fat loss / gain / A1c per PRD §Outputs, maintain ≈ general-health default), **ramped from current reported activity** — week-1 volume starts near the patient's baseline and progresses toward the target over ~4 weeks. A1c template encodes the ≤2-consecutive-rest-days spacing rule. `mobility_limitation` and `cardiac_condition` flags swap in lower-impact wording and add a "clear with physician" note.

### Test vectors (write these first, by hand, before the engine)

1. Mifflin-St Jeor male + female known examples (textbook values).
2. Katch-McArdle from FFM; verify tier selection when body-fat% present.
3. Measured RMR overrides everything.
4. **The PRD's canonical case:** ~165 lb woman, lifts 4×/wk, fat-loss goal producing a sub-floor target → engine clamps and reports EA floor as the reason. This is the demo's money shot; a seed patient embodies it.
5. Renal flag caps protein and emits the flag.
6. Missing FFM → EA degrades to warning, Mifflin path used.
7. A1c goal with BMI < 25 → maintain calories, A1c exercise template.

## Pages

**Roster (`/`).** Patient cards (name, age, goal, last updated), New Patient button, delete with confirm. Seeded examples badged "Example". Small footer disclaimer + "all data stays in this browser" note.

**Intake (`/patient/:id/edit`).** One page, grouped sections mirroring the PRD's input list: Identity → Anthropometrics → Body composition (optional, unlocks EA; a source control — "InBody / DEXA scan" / "Not available" — so the missing EA check is an explicit choice, not a silent gap) → Measured RMR (optional) → Activity + structured exercise (repeatable rows) → 24-hr recall (optional) → Goal (single select, fat-loss default) → Clinical flags (checkboxes). Inline validation; "Generate plan" saves and routes to the plan.

**Plan (`/patient/:id/plan`).** The artifact. Three sections on two printed pages:
1. **Nutrition targets** — calories; protein first and largest; carbs/fat/fiber; RMR-source trust badge; EA value with band; clamp explanation box when applicable; current-vs-target gap bars when recall present.
2. **Food guidance** — portion-anchored equivalents composed from a small food library (chicken, Greek yogurt, eggs, whey, rice, oats, olive oil, nuts, vegetables...), rendered with simple visual portion references (icons/emoji-scale, not photography).
3. **Exercise prescription** — days/wk resistance + cardio, minutes/session, proposed weekly split grid, 4-week progression ramp from current baseline.
4. **"At a glance" closing summary** (Randee's request, 2026-08-20): a compact boxed row ending the document with her four items — energy availability, calorie goal, protein goal, exercise recommendation.
5. **"Beyond the numbers" closing blurb** (Randee, 2026-08-20): a short note after the summary that stress, mental health, medical history, and sleep quality also affect metabolism and body composition and are considered by the provider alongside this plan.

**Copy/provenance rules from Randee's mock review (2026-08-20):** food-guidance running totals say "72 g so far", not "running 72"; the EA meter carries a provenance footnote (30 kcal/kg FFM comes from RED-S / low-energy-availability research, strongest in athletes, used as a conservative default — thresholds are the provider's call; she is researching the evidence base herself). v1.1 candidate: provider-editable protein dose and EA threshold per patient.

Print button → browser print-to-PDF; print CSS hides app chrome, fits two pages. Visible "prepared by a provider; not medical advice absent clinical judgment" disclaimer on screen and in print.

## Seed patients (fictional, `isExample: true`)

1. **Fat loss + InBody data** — exercises the Katch-McArdle path, EA check visible and in the "reduced" band.
2. **The clamp case** — fat-loss goal whose −25% target lands below the EA floor → plan shows the clamped number and the why-box.
3. **Muscle gain, no body comp** — Mifflin path, EA warning state, gain exercise template.

## Execution plan (for the agent fan-out)

**Phase 0 — scaffold (one agent, sequential, everything depends on it):**
Vite+React+TS+Tailwind+Router+Vitest scaffold builds clean; `src/engine/types.ts` and the `Patient` model committed; route skeletons and storage repo interface stubbed; seed-data file with the three patients.

**Phase 1 — parallel workstreams (independent after Phase 0):**
- **WS-A: Engine** — all modules + full test suite against the hand-worked vectors. Pure TS only.
- **WS-B: Roster + storage** — localStorage repo, seeding, roster page, delete/confirm.
- **WS-C: Intake form** — full form, unit conversion, validation, load-example.
- **WS-D: Plan document** — layout, print CSS, food-guidance library, exercise-template rendering. Works against a mocked `PlanResult` until integration.

**Phase 2 — integration + ship (sequential):**
Wire intake → engine → plan; run seeds end-to-end against the test vectors' expected numbers; lint/typecheck/tests green; deploy to Vercel; verify the public link renders the seeded patients and prints to two pages; send Sam the link.

## Deliberately not building (PRD out-of-scope, restated so agents don't scope-creep)

Patient logins, food logging, longitudinal tracking, recipes/menus, EHR/billing, wearables, payments, accounts, any server-side anything.
