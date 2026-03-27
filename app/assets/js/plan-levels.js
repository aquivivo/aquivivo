const KNOWN = ['A1', 'A2', 'B1', 'B2'];

export const KNOWN_LEVELS = Object.freeze([...KNOWN]);

export function normalizePlanKey(planId) {
  return String(planId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniqueOrdered(levels) {
  const set = new Set(
    (Array.isArray(levels) ? levels : [])
      .map((v) => String(v || '').trim().toUpperCase())
      .filter((v) => KNOWN.includes(v)),
  );
  return KNOWN.filter((lvl) => set.has(lvl));
}

export function normalizeLevelList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return uniqueOrdered(raw);
  const parts = String(raw)
    .split(/[,\s;|/]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
  return uniqueOrdered(parts);
}

export function levelsFromPlan(planId) {
  const key = normalizePlanKey(planId);
  if (!key || key === 'free' || key === 'basic') return [];

  if (
    key.includes('premium') ||
    key.includes('vip') ||
    key.includes('all_levels') ||
    key.includes('all')
  ) {
    return [...KNOWN];
  }

  const detected = KNOWN.filter((lvl) => key.includes(lvl.toLowerCase()));
  if (detected.length) return detected;

  if (key.includes('trial')) {
    if (key.includes('a2')) return ['A2'];
    if (key.includes('b1')) return ['B1'];
    if (key.includes('b2')) return ['B2'];
    return ['A1'];
  }

  return [];
}

