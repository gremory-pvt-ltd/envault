import type { NextFunction, Request, Response } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    res.status(403).json({
      error: { code: "forbidden", message: "Admin access required." },
    });
    return;
  }
  next();
}

/**
 * Defense in depth on top of CORS: state-changing requests must come from the
 * configured SPA origin. Server-to-server calls are not part of v1.
 */
export function requireTrustedOrigin(origin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    if (req.headers.origin !== origin) {
      res.status(403).json({
        error: { code: "forbidden_origin", message: "Untrusted request origin." },
      });
      return;
    }
    next();
  };
}
