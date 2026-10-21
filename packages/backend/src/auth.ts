import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { admin } from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./db.js";
import { env, isProd } from "./env.js";

export const auth = betterAuth({
  appName: "envault",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.FRONTEND_URL],
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // The vault is invite-only: admins provision accounts, the public
    // sign-up endpoint stays disabled.
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    admin({
      defaultRole: "member",
      adminRoles: ["admin"],
    }),
    twoFactor({
      issuer: "envault",
    }),
  ],
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      // Frontend and API are different origins (ports in dev, subdomains in
      // production) but the same site, so `lax` cookies are sent with the
      // credentialed CORS requests.
      sameSite: "lax",
      secure: isProd,
    },
  },
});

export const authHandler = toNodeHandler(auth);

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: AuthSession;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!result) {
      res.status(401).json({ error: { code: "unauthorized", message: "Sign in required." } });
      return;
    }
    req.user = result.user;
    req.session = result.session;
    next();
  } catch {
    res.status(401).json({ error: { code: "unauthorized", message: "Sign in required." } });
  }
}
