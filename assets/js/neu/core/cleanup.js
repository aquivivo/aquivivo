const cleanupRegistry = new Set();

function keyOf(tag = '') {
  return String(tag || '').trim().toLowerCase();
}

export function registerCleanup(fn, { tag = '' } = {}) {
  if (typeof fn !== 'function') return () => {};

  const entry = {
    fn,
    tag: keyOf(tag),
  };
  cleanupRegistry.add(entry);

  return () => {
    cleanupRegistry.delete(entry);
  };
}

export function runCleanup({ tag = '' } = {}) {
  const targetTag = keyOf(tag);
  const entries = [...cleanupRegistry];
  let executed = 0;

  entries.forEach((entry) => {
    if (targetTag && entry.tag !== targetTag) return;
    cleanupRegistry.delete(entry);
    executed += 1;
    try {
      entry.fn();
    } catch (error) {
      console.warn('[neu-cleanup] cleanup failed', error);
    }
  });

  return executed;
}

export function cleanupRegistryStats() {
  const byTag = Object.create(null);
  cleanupRegistry.forEach((entry) => {
    const tag = entry.tag || 'untagged';
    byTag[tag] = Number(byTag[tag] || 0) + 1;
  });
  return {
    total: cleanupRegistry.size,
    byTag,
  };
}

export function init() {
  return {
    registerCleanup,
    runCleanup,
    cleanupRegistryStats,
  };
}
