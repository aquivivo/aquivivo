export function validateOnboardingUsername(value) {
  return /^[a-z0-9._-]{3,24}$/i.test(String(value || '').trim());
}

export function validateOnboardingName(value) {
  return String(value || '').trim().length >= 2;
}

export function validateOnboardingCity(value) {
  return String(value || '').trim().length >= 2;
}

export function validateOnboardingTerms(value) {
  return value === true;
}

export function init() {
  return {
    validateOnboardingUsername,
    validateOnboardingName,
    validateOnboardingCity,
    validateOnboardingTerms,
  };
}
