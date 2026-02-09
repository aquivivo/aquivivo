export function normalizePlanKey(planId) {
  return String(planId || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ');
}

export const KNOWN_LEVELS = ['A1', 'A2', 'B1', 'B2'];

export function toDateMaybe(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveAccessUntil(doc) {
  const accessUntil = toDateMaybe(doc?.accessUntil);
  if (accessUntil) return accessUntil;

  const trialAt = toDateMaybe(doc?.trialUsedAt);
  const days = Number(doc?.trialDays || 0);
  if (!trialAt || !Number.isFinite(days) || days <= 0) return null;

  return new Date(trialAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function normalizeLevelList(raw) {
  const set = new Set();
  const push = (lvl) => {
    if (KNOWN_LEVELS.includes(lvl)) set.add(lvl);
  };

  const addFromValue = (value) => {
    const s = String(value ?? '').toUpperCase();
    const matches = s.match(/A1|A2|B1|B2/g);
    if (!matches) return;
    matches.forEach(push);
  };

  if (Array.isArray(raw)) raw.forEach(addFromValue);
  else addFromValue(raw);

  return Array.from(set);
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

  // trials
  trial_a1: ['A1'],

  // VIP (custom names from Stripe / services.sku)
  'vip a1 + a2 + b1': ['A1', 'A2', 'B1'],
  'vip a1 + a2 + b1 + b2': ['A1', 'A2', 'B1', 'B2'],
};

export function levelsFromPlan(planId) {
  const key = normalizePlanKey(planId);
  return PLAN_LEVELS[key] ? [...PLAN_LEVELS[key]] : [];
}
