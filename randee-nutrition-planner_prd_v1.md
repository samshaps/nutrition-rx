# Nutrition & Exercise Planner — PRD v1

**Source:** Voice transcript with Randee (RD), 2026-08-20
**Status:** Draft for review. Not validated with Randee.
**Author:** Sophon, from Sam's recording

---

## The insight Randee couldn't name

Mid-transcript, Randee reaches for a formula and can't retrieve it:

> "It's like total daily energy expenditure minus something divided by fat free mass."

That's **energy availability**: `EA = (Energy Intake − Exercise Energy Expenditure) / kg fat-free mass`. Clinical thresholds run roughly ≥45 kcal/kg FFM optimal, 30–45 reduced, <30 low (LEA). It's the metric that tells you whether the body has enough fuel left over for basic physiology after training is paid for.

This matters more than it looks. Every consumer calorie app will cheerfully prescribe 1,200 kcal to a 165 lb woman who lifts four times a week and hand her a green checkmark for hitting it. A provider tool should refuse, show the number, and explain what breaks. **Energy availability is the guardrail that makes this a clinical instrument rather than a calorie calculator with a prettier font.** It is the single feature most worth getting right, and it's the one Randee described from intuition without having the vocabulary handy.

Everything else in the product — BMR, TDEE, macros, training days — is arithmetic available in fifty free tools. The floor is the differentiator.

**One correction to carry into the build.** Randee says, "ideally I would have their exact basal metabolic rate from like an inbody scan." An InBody doesn't measure BMR. It measures body composition via bioelectrical impedance and then *estimates* BMR from fat-free mass, essentially a Katch-McArdle calculation. It's a better-anchored estimate than Mifflin-St Jeor because it's built on measured FFM instead of a population average, but it is not indirect calorimetry and shouldn't be treated as ground truth. The product should rank input quality explicitly — measured RMR > FFM-derived > population equation — and show the provider which tier they're operating in.

---

## Problem

Dietitians build individualized nutrition and exercise plans by hand. The inputs are knowable (weight, height, age, sex, body composition, activity, current intake, goal) and the transformations are well-established formulas, but the assembly is manual, slow, and inconsistent between patients. The output the patient actually receives is usually a hand-written sheet or a verbal summary that doesn't survive the car ride home.

Randee's framing of the gap, in her words:

> "Take their basal metabolic rate, their total energy daily expenditure, their exercise, and their 24 hour diet recall... and then input the patient's goal or the provider's goal... and then the program spits out: here's the diet plan, here's the exercise plan."

The work is deterministic. It's being done by hand anyway.

---

## Users

**Primary: the provider.** Randee is explicit that this is provider-first — a dietitian creating and managing patient profiles, entering clinical inputs, generating a plan, and handing it over.

> "I wanted to be a tool used by providers, and patients could also buy it for themselves."

**That second clause is two products, and v1 should not build both.** A provider tool optimizes for accuracy, speed of entry, clinical defensibility, and a handoff artifact. A consumer tool optimizes for onboarding, motivation, adherence, and streaks — and it needs to substitute for the clinical judgment a dietitian brings, which is exactly the part that isn't a formula. Building for both produces a tool that a provider finds patronizing and a consumer finds incomprehensible.

The distribution argument also favors provider-only. Randee is the channel. One dietitian with a patient panel is a warm, high-intent, zero-CAC path to real usage and real feedback. Consumer is a cold start against MyFitnessPal, Cronometer, and every fitness influencer's Google Sheet, with no moat.

**Recommendation: provider-only for v1.** Revisit consumer after the plan output is validated against ~20 real patients.

**Secondary: the patient**, as a *recipient* of the plan, not a user of the software. They receive a document. They don't log in.

---

## Scope of v1

The transcript keeps circling one thing. Randee describes the output four separate times, and it's always a document, never an application:

> "I think the simplest version would be like protein, this many grams. Exercise, this many minutes."

> "My picture in the app being like super user friendly to read with like pictures."

> "Like food, and then like the dietary [macros], and then like a weight, and then like the exercise [plan]."

**The product is the plan artifact. The app is the form that generates it.** That's the whole v1. No food logging, no patient login, no adherence tracking, no wearable sync, no messaging.

### In scope

1. **Patient roster.** Create, view, and edit patient profiles. First name, last name, DOB — Sam's framing in the transcript, confirmed by Randee.
2. **Intake form.** Clinical inputs (below), entered in one sitting by the provider.
3. **Calculation engine.** BMR → TDEE → goal-adjusted energy target → macro split → energy-availability check.
4. **Plan generation.** A single readable page: calorie and macro targets, food guidance with portions, weekly exercise prescription.
5. **Export.** Print-to-PDF quality output the provider can hand over, email, or upload to a chart.

### Explicitly out of scope for v1

- Patient-facing accounts or app access
- Food logging or diet tracking over time
- Longitudinal progress charts and re-assessment workflows *(see Open Questions — Randee never raised follow-up visits, which I think is an oversight rather than a decision)*
- Meal plans with recipes and menus, as distinct from food *guidance*
- EHR integration, billing, scheduling
- Wearable or CGM integration
- Payments

---

## Inputs

Grouped by whether they're required to produce a plan.

**Identity (required)**
- First name, last name, date of birth

**Anthropometrics (required)**
- Biological sex, height, current weight

**Body composition (optional, changes the math)**
- Body fat % or fat-free mass, ideally from InBody
- When present, the engine switches from Mifflin-St Jeor to a FFM-based equation and unlocks the energy-availability check

**Metabolic (optional, overrides)**
- Measured RMR from indirect calorimetry, if the practice has it
- This is the only true ground truth; it should override everything else

**Activity**
- Occupational/daily activity level (sedentary through very active)
- Current structured exercise: type, sessions per week, minutes per session

**Dietary**
- 24-hour recall or typical-day recall: calories and protein at minimum

**Goal (required, single select)**
- Lose fat mass — Randee's stated most common case, and the default
- Gain muscle mass — her stated second
- Maintain weight
- Improve A1c

**Clinical flags (required, checkbox list)**
- Not in the transcript. Adding it because a tool that prescribes 2.2 g/kg protein needs to know about renal impairment, and a tool that prescribes 250 min/wk of cardio needs to know about cardiac history or joint limitations. Minimum viable list: renal disease, cardiac condition, pregnancy/lactation, eating disorder history, mobility limitation, on GLP-1.

---

## Calculation engine

The engine is the product. It should be a pure, unit-tested module with no UI dependencies, so the numbers can be verified independently of how they're displayed.

**Resting metabolic rate**, in order of preference:
1. Measured RMR (indirect calorimetry), entered directly
2. Katch-McArdle from measured FFM: `370 + 21.6 × FFM(kg)` — the InBody path
3. Mifflin-St Jeor: `10W + 6.25H − 5A + 5` (male) / `− 161` (female) — the default

Surface which tier was used on the plan itself. A provider should be able to see at a glance how much to trust the number.

**Total daily energy expenditure**
RMR × activity factor (1.2 sedentary → 1.9 very active), with structured exercise accounted separately so exercise energy expenditure is available for the EA calculation.

**Goal-adjusted energy target**

| Goal | Adjustment | Rate target |
|---|---|---|
| Lose fat mass | −15 to −25% of TDEE | 0.5–1.0% body weight/week |
| Gain muscle mass | +10 to +20% of TDEE | 0.25–0.5% body weight/week |
| Maintain | TDEE | — |
| Improve A1c | −10 to −20% if BMI elevated, else maintain | 5–10% total body weight loss |

**Floors — non-negotiable, and the reason the tool exists**
- Never prescribe below measured or estimated RMR
- Never prescribe below 30 kcal/kg FFM energy availability
- When a goal-derived target violates a floor, clamp to the floor and show the provider *why*, with the number

**Macros**
- Protein: 1.6–2.2 g/kg body weight for fat loss with muscle preservation; adjusted body weight or FFM-based dosing in obesity; capped and flagged when renal impairment is checked
- Fat: floor at ~0.6 g/kg, minimum ~20% of calories
- Carbohydrate: remainder
- Fiber: 14 g per 1,000 kcal

**Energy availability**
`EA = (target intake − exercise energy expenditure) / kg FFM`. Display with the threshold bands. Requires FFM, so it degrades gracefully to a warning when body composition is absent.

---

## Outputs

One document, three sections, designed to be read by a patient with no clinical background and printed on two pages.

**1. Nutrition targets**
Calories per day. Protein, carbs, fat in grams — protein first and largest, since it's the number Randee names first and the one that drives outcomes. Fiber target. Current-vs-target comparison drawn from the 24-hour recall.

**2. Food guidance**
Not a meal plan. Portion-anchored guidance: what a day of hitting these numbers physically looks like. "155 g protein ≈ 6 oz chicken + 1 cup Greek yogurt + 2 eggs + 1 scoop whey." Randee wants imagery here — "pictures of food" — which in practice means visual portion references, not photography.

**3. Exercise prescription**
Days per week of resistance training, days per week of cardio, minutes per session, and a proposed weekly split. Randee asked for this specifically:

> "Like, even like a proposed exercise plan would be great."

Prescriptions by goal, anchored to published guidance:
- **Fat loss:** resistance 3–4×/wk, aerobic 200–300 min/wk moderate, progressed from current baseline
- **Muscle gain:** resistance 4×/wk, 10–20 hard sets per muscle group per week, cardio limited to 2 sessions
- **A1c:** ≥150 min/wk aerobic spread over ≥3 days with no more than 2 consecutive rest days (the post-exercise insulin sensitivity window is roughly 24–48 hrs, which is *why* the spacing matters), resistance 2–3×/wk on nonconsecutive days, plus interrupting sedentary time every 30 min

**Progression matters.** Nobody goes from zero to 250 min/wk. The prescription should start from the patient's current reported activity and ramp, not state the endpoint as though it's week one.

---

## Architecture position: no PHI on a server

Name, date of birth, weight, body composition, and A1c together are identifiable health information. The moment that touches a server owned by Sam, a dietitian using this with real patients is relying on infrastructure that has no BAA, no audit logging, and no breach process.

**Recommendation: v1 stores everything client-side.** Browser local storage or IndexedDB, no backend, no accounts, no transmission. The full calculation engine runs in the browser. Export is a local print-to-PDF.

The tradeoffs are real and worth stating plainly: no cross-device sync, data loss if the browser is cleared, no multi-provider practice sharing. Every one of those is an acceptable v1 cost, and each is a reason to charge money for v2 rather than a blocker on shipping v1. It also means the tool can go in front of a real patient this week instead of after a compliance review.

---

## Open questions for Randee

These are the places the transcript genuinely doesn't settle, separated from the places I've taken a position above.

1. **What is the 24-hour recall actually for?** It's listed as an input, but the transcript never says what the program does with it. My read: its job is the *gap*, not the plan — showing a patient that they're eating 70 g of protein against a 155 g target is the most behaviorally useful number on the page. If it isn't doing that, it's a data-entry tax that produces nothing, and it should be cut. Recommend confirming before building the input.

2. **Is "improve A1c" a goal or a modifier?** I'd argue modifier. A patient with elevated A1c still needs a weight direction — lose, gain, or maintain — and the A1c consideration changes carbohydrate distribution, fiber emphasis, and exercise spacing on top of that. Modeling it as a fourth mutually exclusive goal forces a false choice. This changes the data model, so it's worth deciding before the schema is written.

3. **How specific should food guidance be?** Portion-anchored examples (my recommendation) versus a full menu with recipes are different products with very different build costs. "Pictures of food" is ambiguous between them.

4. **What happens at the follow-up visit?** Randee never mentions re-assessment, but patients come back in six weeks having lost four pounds, and the plan needs to change. Not building it in v1 is defensible. Not *asking* about it isn't — it determines whether the data model is a document or a record.

5. **Is the exercise plan template-driven or individualized?** Templates by goal are shippable this week. Genuine individualization against equipment access, training history, and injury is a much larger build.

6. **Who else has to accept this document?** If it goes in a chart or gets attached to a superbill, it needs to look a certain way. If it's just handed to a patient, it doesn't.

---

## Risks

- **Clinical liability.** A tool that outputs specific caloric and exercise prescriptions is offering something that looks like medical advice. It needs a visible disclaimer, provider-in-the-loop framing, and no path for a patient to self-generate a plan without a provider. This is another argument against the consumer version.
- **Formula accuracy is table stakes and invisible.** Nobody will praise correct math. Everyone will notice one wrong number, once, and stop trusting the tool permanently. The engine needs real unit tests against hand-worked examples before Randee sees it.
- **Energy availability thresholds come primarily from athlete literature** (RED-S and Female Athlete Triad research). Applying them to a general clinical population is defensible as a conservative floor but shouldn't be presented with more precision than it has.
- **Randee is a sample size of one.** Her "most common goal is lose fat mass" is her panel, not the market. Fine for v1 — she's the design partner and the first user — but don't generalize from it when scoping v2.
- **Client-side storage will eventually lose someone's data.** Ship it anyway, warn clearly, and treat sync as the first paid feature.

---

## v1 build order

1. Calculation engine as a standalone tested module — BMR tiers, TDEE, goal targets, floors, macros, energy availability
2. Patient roster with client-side persistence
3. Intake form
4. Plan output page, print-optimized
5. Deploy, send Randee a link, watch her use it on a real patient without helping her

Step 5 is the actual test. Randee asked for it directly:

> "And then if you build it, like, could I, like, try it and use it?"
