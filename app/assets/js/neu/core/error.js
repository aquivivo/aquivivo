export function createNeuError(message, cause = null) {
  const error = new Error(String(message || 'NEU error'));
  if (cause) error.cause = cause;
  return error;
}

export function reportNeuError(error, { scope = 'neu' } = {}) {
  console.error(`[${scope}]`, error);
  return error;
}

export async function runWithNeuErrorBoundary(task, { scope = 'neu' } = {}) {
  try {
    return await task();
  } catch (error) {
    throw reportNeuError(error, { scope });
  }
}

export function init() {
  return { createNeuError, reportNeuError, runWithNeuErrorBoundary };
}
