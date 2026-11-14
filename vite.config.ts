import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

/**
 * Stamp each build with its own time. (A `define` is evaluated once when the dev watcher starts,
 * so every rebuild during `npm run dev` kept the first build's time.)
 */
function buildStamp(): Plugin {
  return {
    name: 'arlr-build-stamp',
    renderChunk(code) {
      return code.includes('__BUILD_TIME__') ? { code: code.replaceAll('__BUILD_TIME__', JSON.stringify(new Date().toISOString())), map: null } : null;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwind(), devvit(), buildStamp()],
});
