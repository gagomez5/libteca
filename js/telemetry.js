"use strict";

// ======= Sentry (reporte de errores en producción) =======
if(window.Sentry){
  Sentry.init({
    dsn: 'https://ed94dc6234535bf2bf6da95bf7b8604f@o4511990408151040.ingest.us.sentry.io/4511990414311424',
    environment: (location.hostname === 'bruukion.com') ? 'production' : 'development',
    initialScope: { tags: { app: 'main' } }
  });
}
export function reportError(err){
  if(!window.Sentry || !err) return;
  Sentry.captureException(err instanceof Error ? err : new Error(err.message || String(err)));
}
export function setSentryUser(id){
  if(window.Sentry) Sentry.setUser(id ? { id: id } : null);
}
// ===========================================================

// ======= PostHog (analítica de producto: embudo Free→Premium) =======
if(window.posthog){
  posthog.init('phc_qXKDnVNxgmSN4Vy4YpedqTeBczbgd4RfudrSJRhYu386', {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: true,
    disable_session_recording: true,
    disable_external_dependency_loading: true
  });
}
export function trackEvent(name, props){
  if(window.posthog) posthog.capture(name, props || {});
}
export function setAnalyticsUser(id){
  if(!window.posthog) return;
  if(id) posthog.identify(id); else posthog.reset();
}
// ===========================================================
