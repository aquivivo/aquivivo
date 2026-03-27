let onboardingUiInitialized = false;

export function createOnboardingUi() {
  return {
    init() {
      if (onboardingUiInitialized) return;
      onboardingUiInitialized = true;
      // Onboarding UI is rendered and wired by legacy onboarding runtime.
    },
  };
}

export function init() {
  const ui = createOnboardingUi();
  ui.init();
  return ui;
}
