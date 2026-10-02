import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** Where the client lives in the browser. The API keeps its own paths. */
export const CLIENT_PATH = '/app';

const NO_CACHE = 'no-cache';
const YEAR_SECONDS = 31_536_000;

/**
 * Serves the built client from `client_dir` under `/app`. Files under `/app/assets` carry hashed
 * names, so they are cached for a year as immutable; a missing one is a 404. Any other `GET` under
 * `/app` answers the page itself without caching, so a reload of a deep link opens the same screen,
 * and `/` redirects to `/app/`. These files are public: the sign-in page loads before any token.
 *
 * @param app - The web application, before it starts listening.
 * @param client_dir - The client's build output, holding `index.html` and `assets/`.
 */
export function serve_client(app: NestExpressApplication, client_dir: string): void {
  const index = join(client_dir, 'index.html');
  app.useStaticAssets(join(client_dir, 'assets'), {
    prefix: `${CLIENT_PATH}/assets`,
    index: false,
    fallthrough: false,
    immutable: true,
    maxAge: YEAR_SECONDS * 1_000,
  });
  app.useStaticAssets(client_dir, {
    prefix: CLIENT_PATH,
    index: false,
    setHeaders: (response: ServerResponse) => {
      response.setHeader('Cache-Control', NO_CACHE);
    },
  });
  app.use(CLIENT_PATH, (request: Request, response: Response, next: NextFunction) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      next();
      return;
    }
    response.setHeader('Cache-Control', NO_CACHE);
    response.sendFile(index);
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      response.redirect(302, `${CLIENT_PATH}/`);
      return;
    }
    next();
  });
}
