import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';

import { createServer, getServerPort } from '@devvit/web/server';
import express from 'express';
import { telemetryRouter } from '@devvit/analytics/server/reddit';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { scheduler } from './routes/scheduler';
import { appRouter } from './trpc';
import { createContext } from './context';

const app = new Hono();

const api = new Hono();
api.use(
  '/trpc/*',
  trpcServer({
    endpoint: '/api/trpc',
    router: appRouter,
    createContext,
  })
);

const internal = new Hono();
internal.route('/menu', menu);
internal.route('/triggers', triggers);
internal.route('/scheduler', scheduler);

app.route('/api', api);
app.route('/internal', internal);

// Devvit Journeys: the official telemetry router (Express) answers /api/telemetry/*; everything else
// goes to Hono. Wrapping the listener keeps both on Devvit's server.
const journeys = express();
journeys.use(telemetryRouter);
type Listener = Parameters<typeof createServer>[1];
const withJourneys = ((options: Parameters<typeof createServer>[0], listener: NonNullable<Listener>) =>
  createServer(options as never, (req, res) => {
    if (req.url?.startsWith('/api/telemetry/')) journeys(req as never, res as never);
    else listener(req, res);
  })) as typeof createServer;

serve({
  fetch: app.fetch,
  createServer: withJourneys,
  port: getServerPort(),
});
