import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { parseDotenv, serializeDotenv } from "../lib/dotenv.js";
import {
  asyncHandler,
  HttpError,
  notFound,
  parseBody,
  parseQuery,
} from "../lib/http.js";

const router = Router();

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

const valueSchema = z.string().max(262_144, "Values are limited to 256 KB.");
const noteSchema = z.string().trim().max(500).optional();
const typeSchema = z.enum(["string", "url", "number", "boolean", "json"]).default("string");

const createSecretSchema = z.object({
  key: z.string().trim().min(1).max(200).regex(KEY_RE, "Use env-style keys (A-Z, 0-9, _, ., -)."),
  value: valueSchema,
  type: typeSchema.optional(),
  note: noteSchema,
});

const updateSecretSchema = z
  .object({
    value: valueSchema.optional(),
    type: typeSchema.optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});

async function environmentContext(environmentId: string) {
  const environment = await prisma.environment.findUnique({
    where: { id: environmentId },
    include: { project: true },
  });
  if (!environment) throw notFound("Environment not found.");
  return environment;
}

function actor(req: Express.Request) {
  return {
    createdById: req.user?.id ?? null,
    createdByEmail: req.user?.email ?? null,
  };
}

// ---------------------------------------------------------------------------
// Environment secrets
// ---------------------------------------------------------------------------

router.get(
  "/environments/:environmentId/secrets",
  asyncHandler(async (req, res) => {
    const environment = await environmentContext(req.params.environmentId);
    const query = parseQuery(listQuerySchema, req);

    const secrets = await prisma.secret.findMany({
      where: {
        environmentId: environment.id,
        deletedAt: null,
        ...(query.q ? { key: { contains: query.q } } : {}),
      },
      orderBy: { key: "asc" },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { value: true },
        },
      },
    });

    res.json({
      data: {
        environment: {
          id: environment.id,
          name: environment.name,
          slug: environment.slug,
          isProduction: environment.isProduction,
          projectId: environment.projectId,
        },
        project: {
          id: environment.project.id,
          name: environment.project.name,
          slug: environment.project.slug,
        },
        secrets: secrets.map((secret) => ({
          id: secret.id,
          key: secret.key,
          type: secret.type,
          note: secret.note,
          currentVersion: secret.currentVersion,
          valueLength: secret.versions[0]?.value.length ?? 0,
          createdAt: secret.createdAt,
          updatedAt: secret.updatedAt,
          createdByEmail: secret.createdByEmail,
          updatedByEmail: secret.updatedByEmail,
        })),
      },
    });
  }),
);

router.post(
  "/environments/:environmentId/secrets",
  asyncHandler(async (req, res) => {
    const environment = await environmentContext(req.params.environmentId);
    const body = parseBody(createSecretSchema, req);

    const existing = await prisma.secret.findUnique({
      where: {
        environmentId_key: {
          environmentId: environment.id,
          key: body.key,
        },
      },
    });

    if (existing && !existing.deletedAt) {
      throw new HttpError(
        409,
        "conflict",
        `${body.key} already exists in ${environment.name}. Edit it instead.`,
      );
    }

    const who = actor(req);
    let secret;

    if (existing) {
      // Revive a soft-deleted key with a fresh version.
      const version = existing.currentVersion + 1;
      await prisma.$transaction([
        prisma.secretVersion.create({
          data: {
            secretId: existing.id,
            version,
            value: body.value,
            comment: "Re-added",
            ...who,
          },
        }),
        prisma.secret.update({
          where: { id: existing.id },
          data: {
            currentVersion: version,
            deletedAt: null,
            type: body.type ?? "string",
            note: body.note ?? null,
            updatedById: who.createdById,
            updatedByEmail: who.createdByEmail,
          },
        }),
      ]);
      secret = await prisma.secret.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      secret = await prisma.secret.create({
        data: {
          environmentId: environment.id,
          key: body.key,
          currentVersion: 1,
          type: body.type ?? "string",
          note: body.note ?? null,
          ...who,
          updatedById: who.createdById,
          updatedByEmail: who.createdByEmail,
          versions: {
            create: {
              version: 1,
              value: body.value,
              comment: "Initial value",
              ...who,
            },
          },
        },
      });
    }

    await audit({
      req,
      action: "secret.created",
      project: environment.project,
      environment,
      secretKey: secret.key,
      metadata: { version: secret.currentVersion },
    });

    res.status(201).json({ data: { id: secret.id, key: secret.key, version: secret.currentVersion } });
  }),
);

// ---------------------------------------------------------------------------
// Single secret
// ---------------------------------------------------------------------------

async function secretContext(secretId: string) {
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, deletedAt: null },
    include: {
      environment: { include: { project: true } },
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!secret) throw notFound("Secret not found.");
  return secret;
}

router.patch(
  "/secrets/:secretId",
  asyncHandler(async (req, res) => {
    const secret = await secretContext(req.params.secretId);
    const body = parseBody(updateSecretSchema, req);
    const who = actor(req);

    let version = secret.currentVersion;

    if (body.value !== undefined) {
      version = secret.currentVersion + 1;
      await prisma.$transaction([
        prisma.secretVersion.create({
          data: {
            secretId: secret.id,
            version,
            value: body.value,
            comment: "Updated",
            ...who,
          },
        }),
        prisma.secret.update({
          where: { id: secret.id },
          data: {
            currentVersion: version,
            type: body.type ?? secret.type,
            note: body.note === undefined ? undefined : body.note,
            updatedById: who.createdById,
            updatedByEmail: who.createdByEmail,
          },
        }),
      ]);
    } else {
      await prisma.secret.update({
        where: { id: secret.id },
        data: {
          type: body.type ?? undefined,
          note: body.note === undefined ? undefined : body.note,
          updatedById: who.createdById,
          updatedByEmail: who.createdByEmail,
        },
      });
    }

    await audit({
      req,
      action: "secret.updated",
      project: secret.environment.project,
      environment: secret.environment,
      secretKey: secret.key,
      metadata: { version, valueChanged: body.value !== undefined },
    });

    res.json({ data: { id: secret.id, key: secret.key, version } });
  }),
);

router.delete(
  "/secrets/:secretId",
  asyncHandler(async (req, res) => {
    const secret = await secretContext(req.params.secretId);

    await prisma.secret.update({
      where: { id: secret.id },
      data: { deletedAt: new Date() },
    });

    await audit({
      req,
      action: "secret.deleted",
      project: secret.environment.project,
      environment: secret.environment,
      secretKey: secret.key,
    });

    res.json({ data: { id: secret.id } });
  }),
);

router.post(
  "/secrets/:secretId/reveal",
  asyncHandler(async (req, res) => {
    const secret = await secretContext(req.params.secretId);
    const current = secret.versions[0];
    if (!current) throw notFound("Secret value not found.");

    await audit({
      req,
      action: "secret.revealed",
      project: secret.environment.project,
      environment: secret.environment,
      secretKey: secret.key,
      metadata: { version: current.version },
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      data: {
        id: secret.id,
        key: secret.key,
        value: current.value,
        version: current.version,
      },
    });
  }),
);

router.get(
  "/secrets/:secretId/versions",
  asyncHandler(async (req, res) => {
    const secret = await secretContext(req.params.secretId);

    const versions = await prisma.secretVersion.findMany({
      where: { secretId: secret.id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        comment: true,
        createdByEmail: true,
        createdAt: true,
      },
    });

    res.json({
      data: {
        secret: { id: secret.id, key: secret.key, currentVersion: secret.currentVersion },
        versions,
      },
    });
  }),
);

router.post(
  "/secrets/:secretId/versions/:version/restore",
  asyncHandler(async (req, res) => {
    const secret = await secretContext(req.params.secretId);
    const targetVersion = Number(req.params.version);

    if (!Number.isInteger(targetVersion)) {
      throw new HttpError(400, "validation_error", "Invalid version.");
    }

    const target = await prisma.secretVersion.findUnique({
      where: { secretId_version: { secretId: secret.id, version: targetVersion } },
    });
    if (!target) throw notFound("That version does not exist.");
    if (targetVersion === secret.currentVersion) {
      throw new HttpError(400, "no_change", "That version is already current.");
    }

    const who = actor(req);
    const version = secret.currentVersion + 1;

    await prisma.$transaction([
      prisma.secretVersion.create({
        data: {
          secretId: secret.id,
          version,
          value: target.value,
          comment: `Restored from v${targetVersion}`,
          ...who,
        },
      }),
      prisma.secret.update({
        where: { id: secret.id },
        data: {
          currentVersion: version,
          updatedById: who.createdById,
          updatedByEmail: who.createdByEmail,
        },
      }),
    ]);

    await audit({
      req,
      action: "secret.restored",
      project: secret.environment.project,
      environment: secret.environment,
      secretKey: secret.key,
      metadata: { fromVersion: targetVersion, toVersion: version },
    });

    res.json({ data: { id: secret.id, version } });
  }),
);

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

const importSchema = z.object({
  content: z.string().min(1).max(262_144),
  dryRun: z.boolean().default(false),
});

router.post(
  "/environments/:environmentId/import",
  asyncHandler(async (req, res) => {
    const environment = await environmentContext(req.params.environmentId);
    const body = parseBody(importSchema, req);
    const parsed = parseDotenv(body.content);

    const byKey = new Map(parsed.entries.map((entry) => [entry.key, entry]));
    const existing = await prisma.secret.findMany({
      where: { environmentId: environment.id, key: { in: [...byKey.keys()] } },
      select: { key: true, deletedAt: true },
    });
    const existingMap = new Map(existing.map((row) => [row.key, row]));

    const entries = [...byKey.values()].map((entry) => ({
      key: entry.key,
      action:
        existingMap.has(entry.key) && !existingMap.get(entry.key)?.deletedAt
          ? ("update" as const)
          : ("create" as const),
      valueLength: entry.value.length,
    }));

    if (body.dryRun) {
      res.json({
        data: {
          entries,
          errors: parsed.errors,
          duplicates: parsed.duplicates,
          counts: {
            create: entries.filter((entry) => entry.action === "create").length,
            update: entries.filter((entry) => entry.action === "update").length,
          },
        },
      });
      return;
    }

    if (entries.length > 500) {
      throw new HttpError(400, "too_many", "Import at most 500 keys at a time.");
    }

    const who = actor(req);
    let created = 0;
    let updated = 0;

    for (const entry of byKey.values()) {
      const match = existingMap.get(entry.key);
      if (match && !match.deletedAt) {
        const current = await prisma.secret.findUniqueOrThrow({
          where: { environmentId_key: { environmentId: environment.id, key: entry.key } },
        });
        const version = current.currentVersion + 1;
        await prisma.$transaction([
          prisma.secretVersion.create({
            data: {
              secretId: current.id,
              version,
              value: entry.value,
              comment: "Imported",
              ...who,
            },
          }),
          prisma.secret.update({
            where: { id: current.id },
            data: {
              currentVersion: version,
              updatedById: who.createdById,
              updatedByEmail: who.createdByEmail,
            },
          }),
        ]);
        updated++;
      } else if (match?.deletedAt) {
        const current = await prisma.secret.findUniqueOrThrow({
          where: { environmentId_key: { environmentId: environment.id, key: entry.key } },
        });
        const version = current.currentVersion + 1;
        await prisma.$transaction([
          prisma.secretVersion.create({
            data: {
              secretId: current.id,
              version,
              value: entry.value,
              comment: "Re-added by import",
              ...who,
            },
          }),
          prisma.secret.update({
            where: { id: current.id },
            data: {
              currentVersion: version,
              deletedAt: null,
              updatedById: who.createdById,
              updatedByEmail: who.createdByEmail,
            },
          }),
        ]);
        created++;
      } else {
        await prisma.secret.create({
          data: {
            environmentId: environment.id,
            key: entry.key,
            currentVersion: 1,
            ...who,
            updatedById: who.createdById,
            updatedByEmail: who.createdByEmail,
            versions: {
              create: { version: 1, value: entry.value, comment: "Imported", ...who },
            },
          },
        });
        created++;
      }
    }

    await audit({
      req,
      action: "secrets.imported",
      project: environment.project,
      environment,
      metadata: {
        created,
        updated,
        keys: entries.slice(0, 50).map((entry) => entry.key),
        invalidLines: parsed.errors.length,
      },
    });

    res.json({
      data: {
        created,
        updated,
        invalid: parsed.errors,
        duplicates: parsed.duplicates,
      },
    });
  }),
);

router.post(
  "/environments/:environmentId/export",
  asyncHandler(async (req, res) => {
    const environment = await environmentContext(req.params.environmentId);

    const secrets = await prisma.secret.findMany({
      where: { environmentId: environment.id, deletedAt: null },
      orderBy: { key: "asc" },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1, select: { value: true } },
      },
    });

    const content = serializeDotenv(
      secrets.map((secret) => ({
        key: secret.key,
        value: secret.versions[0]?.value ?? "",
      })),
    );

    await audit({
      req,
      action: "environment.exported",
      project: environment.project,
      environment,
      metadata: { count: secrets.length, keys: secrets.slice(0, 50).map((s) => s.key) },
    });

    const filename = `${environment.project.slug}-${environment.slug}.env`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(content);
  }),
);

export default router;
