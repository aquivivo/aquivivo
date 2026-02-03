export function normalizePlanKey(planId) {
  return String(planId || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ');
}

const PLAN_LEVELS = {
  free: [],

  // single levels
  a1: ['A1'],
  a2: ['A2'],
  b1: ['B1'],
  b2: ['B2'],

  // premium bundles (progressive)
  premium: ['A1', 'A2', 'B1', 'B2'],
  premium_a1: ['A1', 'A2'],
  premium_b1: ['A1', 'A2', 'B1'],
  premium_b2: ['A1', 'A2', 'B1', 'B2'],

  // VIP (custom names from Stripe / services.sku)
  'vip a1 + a2 + b1': ['A1', 'A2', 'B1'],
  'vip a1 + a2 + b1 + b2': ['A1', 'A2', 'B1', 'B2'],
};

export function levelsFromPlan(planId) {
  const key = normalizePlanKey(planId);
  return PLAN_LEVELS[key] ? [...PLAN_LEVELS[key]] : [];
}
