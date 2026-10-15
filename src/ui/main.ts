import './styles.css';
import { app } from './app';
import { hubScreen } from './screens/hub';
import { learnScreen } from './screens/learn';
import { onboardingScreen } from './screens/onboarding';
import { settingsScreen } from './screens/settings';
import { statsScreen } from './screens/stats';

app.home = learnScreen;
app.tabs = { learn: learnScreen, drill: hubScreen, stats: statsScreen, settings: settingsScreen };
app.applyDisplay();
if (app.prefs.profile.onboarded) app.goTab('learn');
else app.go(onboardingScreen());

// Works offline once loaded: a service worker caches the app (production builds only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
  });
}
