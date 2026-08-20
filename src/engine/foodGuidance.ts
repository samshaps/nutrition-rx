/**
 * Food guidance — portion-anchored equivalents, not a meal plan.
 *
 * The PRD is specific about the shape of this output: "155 g protein ≈ 6 oz
 * chicken + 1 cup Greek yogurt + 2 eggs + 1 scoop whey". The job is to make an
 * abstract gram target physically legible, so the patient can picture the day.
 *
 * The composition targets roughly 90% of the protein number, not 100%. The
 * remainder comes from protein incidental to the rest of the day (bread, rice,
 * beans, dairy in coffee), which is real and which a patient will otherwise
 * double-count. Composition is greedy over a fixed, largest-first library with
 * a cap of two servings of any single food, so the list stays varied and
 * deterministic.
 *
 * Not part of `PlanResult` — `types.ts` is a shared contract owned by Phase 0
 * and this output arrived later, so it is exported separately from the engine
 * index for the plan document to call directly.
 */

export interface FoodItem {
  /** Food name as a patient would say it. */
  label: string;
  /** The portion that supplies `proteinG`. */
  portion: string;
  proteinG: number;
  /** A visual portion anchor (PRD: "pictures of food" = portion references). */
  emoji: string;
}

/**
 * Small, deliberately boring library of protein anchors. Values are rounded
 * cooked-portion figures.
 */
export const PROTEIN_LIBRARY: FoodItem[] = [
  { label: 'Chicken breast', portion: '6 oz cooked', proteinG: 52, emoji: '🍗' },
  { label: 'Lean beef or bison', portion: '5 oz cooked', proteinG: 40, emoji: '🥩' },
  { label: 'Salmon', portion: '4 oz cooked', proteinG: 28, emoji: '🐟' },
  { label: 'Whey protein', portion: '1 scoop', proteinG: 25, emoji: '🥤' },
  { label: 'Cottage cheese', portion: '1 cup', proteinG: 25, emoji: '🧀' },
  { label: 'Greek yogurt', portion: '1 cup plain', proteinG: 20, emoji: '🥛' },
  { label: 'Tofu, firm', portion: '1 cup cubed', proteinG: 20, emoji: '🍲' },
  { label: 'Lentils or black beans', portion: '1 cup cooked', proteinG: 18, emoji: '🫘' },
  { label: 'Eggs', portion: '2 large', proteinG: 12, emoji: '🥚' },
];

/** Max servings of any one food, so the list reads like a day of eating. */
const MAX_PER_ITEM = 2;
/** Compose to about this share of the protein target. */
const COVERAGE_TARGET = 0.9;
/** Allowed overshoot of the coverage target when placing the last item. */
const COVERAGE_TOLERANCE = 1.05;

export interface FoodGuidanceItem {
  label: string;
  /** Portion text, pluralised with a multiplier when a food repeats. */
  portion: string;
  proteinG: number;
  emoji: string;
  servings: number;
}

export interface FoodGuidance {
  /** The protein target this was composed against. */
  targetProteinG: number;
  items: FoodGuidanceItem[];
  /** Protein supplied by `items`. */
  totalProteinG: number;
  /** totalProteinG as a whole-number percentage of the target. */
  coveragePct: number;
  /** One-liners for the non-protein macros. Static by design. */
  carbGuidance: string;
  fatGuidance: string;
  fiberGuidance: string;
}

function portionText(item: FoodItem, servings: number): string {
  return servings > 1 ? `${servings} x ${item.portion}` : item.portion;
}

/**
 * Compose portion equivalents covering ~90% of `proteinG`.
 *
 * Greedy, largest-first, at most two servings of any one food, stopping as soon
 * as the running total reaches the coverage target.
 */
export function buildFoodGuidance(proteinG: number): FoodGuidance {
  const target = Math.max(0, Math.round(proteinG));
  const goal = target * COVERAGE_TARGET;
  const ceiling = goal * COVERAGE_TOLERANCE;

  const counts = new Map<string, number>();
  const order: FoodItem[] = [];
  let total = 0;

  if (target > 0) {
    const library = [...PROTEIN_LIBRARY].sort((a, b) => b.proteinG - a.proteinG);
    for (const item of library) {
      while (
        total < goal &&
        (counts.get(item.label) ?? 0) < MAX_PER_ITEM &&
        total + item.proteinG <= ceiling
      ) {
        const next = (counts.get(item.label) ?? 0) + 1;
        if (next === 1) order.push(item);
        counts.set(item.label, next);
        total += item.proteinG;
      }
      if (total >= goal) break;
    }
  }

  const items: FoodGuidanceItem[] = order.map((item) => {
    const servings = counts.get(item.label) ?? 1;
    return {
      label: item.label,
      portion: portionText(item, servings),
      proteinG: item.proteinG * servings,
      emoji: item.emoji,
      servings,
    };
  });

  return {
    targetProteinG: target,
    items,
    totalProteinG: total,
    coveragePct: target > 0 ? Math.round((total / target) * 100) : 0,
    carbGuidance:
      'Build carbohydrate around whole grains, potatoes, fruit, and beans, and put the largest portion in the meals either side of training.',
    fatGuidance:
      'Fats come mostly from olive oil, nuts, seeds, avocado, and the fish above — roughly a thumb-sized portion of added fat per meal.',
    fiberGuidance:
      'Fiber comes from vegetables at two meals, a piece of whole fruit, and one serving of beans, lentils, or whole grains each day.',
  };
}
