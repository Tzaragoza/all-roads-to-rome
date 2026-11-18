import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Needed due to the custom conditions within devvit web
    typecheck: {
      enabled: false,
    },
    reporters: ['dot'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        test: {
          name: 'server',
          include: ['src/server/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000, // some tests generate hundreds of maps; slower PCs need more than the 5 s default
        },
      },
      {
        test: {
          name: 'client',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/server/**/*'],
          environment: 'jsdom',
          testTimeout: 60_000,
        },
      },
    ],
  },
});
