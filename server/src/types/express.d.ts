import type { User } from '@prisma/client';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Set by `requireAuth` from a verified token. Route handlers read the
       * acting user from here and nowhere else -- never from the request body.
       */
      user?: User;
    }
  }
}

export {};
