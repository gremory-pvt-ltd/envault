import os from "node:os";
import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { authHandler, requireAuth } from "./auth.js";
import { configureSqlite, prisma } from "./db.js";
import { env, isProd } from "./env.js";
import { errorHandler } from "./lib/http.js";
import { requireTrustedOrigin } from "./middleware.js";
import auditRouter from "./routes/audit.js";
import environmentsRouter from "./routes/environments.js";
import membersRouter from "./routes/members.js";
import projectsRouter from "./routes/projects.js";
import secretsRouter from "./routes/secrets.js";

const app: Express = express();

app.disable("x-powered-by");
if (isProd) app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: [env.FRONTEND_URL],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
    maxAge: 86_400,
  }),
);

app.use(morgan(isProd ? "combined" : "dev"));

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "envault", time: new Date().toISOString() });
});

// Brute-force protection on credential sign-in. Mounted before the auth
// handler so it also covers better-auth's own endpoint.
app.use(
  "/api/auth/sign-in",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "rate_limited", message: "Too many sign-in attempts. Try again later." } },
  }),
);

// better-auth reads the raw Node request; mount it before express.json().
app.all("/api/auth/*", authHandler);

app.use(express.json({ limit: "300kb" }));

app.use("/api", requireTrustedOrigin(env.FRONTEND_URL));
app.use("/api", requireAuth);

app.get("/api/me", (req, res) => {
  res.json({
    data: {
      id: req.user?.id,
      name: req.user?.name,
      email: req.user?.email,
      role: req.user?.role ?? "member",
      twoFactorEnabled: req.user?.twoFactorEnabled ?? false,
      createdAt: req.user?.createdAt,
    },
  });
});

app.use("/api/projects", projectsRouter);
app.use("/api/environments", environmentsRouter);
app.use("/api/members", membersRouter);
app.use("/api/audit", auditRouter);
app.use("/api", secretsRouter);

app.use("/api/*", (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Endpoint not found." } });
});

app.use(errorHandler);

function getLanIp(): string | undefined {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return undefined;
}

async function main() {
  await prisma.$connect();
  await configureSqlite();

  const server = app.listen(env.PORT, env.HOST, () => {
    console.log(`envault api listening on http://${env.HOST}:${env.PORT}`);
    const lan = getLanIp();
    if (lan) console.log(`envault api on LAN: http://${lan}:${env.PORT}`);
    console.log(`allowed SPA origin: ${env.FRONTEND_URL}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down…`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start envault api:", error);
  process.exit(1);
});
