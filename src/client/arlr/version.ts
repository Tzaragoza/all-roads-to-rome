/* global __BUILD_TIME__ */
import { context } from '@devvit/web/client';

/** "v0.0.1.9 · built 13 Nov 19:42" (Devvit app version + local build time). */
export function versionLabel(): string {
  let v = '';
  try { v = context?.appVersion ? `v${context.appVersion}` : ''; } catch { /* outside Reddit */ }
  const t = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''; // injected by vite.config.ts
  const built = t ? `built ${new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '';
  return [v, built].filter(Boolean).join(' · ');
}
