import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Anonymous extension user id from `X-User-Id` (set by `requireExtensionUserId`). */
    extensionUserId?: string;
  }
}
