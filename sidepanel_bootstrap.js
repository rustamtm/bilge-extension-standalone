const BILGE_ONBOARDING_SEEN_KEY = 'bilge_onboarding_seen';

try {
  if (localStorage.getItem(BILGE_ONBOARDING_SEEN_KEY) !== 'true') {
    localStorage.setItem(BILGE_ONBOARDING_SEEN_KEY, 'true');
  }
} catch (_error) {
  // Ignore storage failures so sidepanel boot can continue.
}
