import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, HttpError, notFound, parseBody } from "../lib/http.js";
import { requireAdmin } from "../middleware.js";

const router = Router();

const DEFAULT_ENVIRONMENTS = [
  { name: "Development", slug: "development", sortOrder: 0, isProduction: false },
  { name: "Staging", slug: "staging", sortOrder: 1, isProduction: false },
  { name: "Production", slug: "production", sortOrder: 2, isProduction: true },
];

const projectBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function uniqueProjectSlug(base: string) {
  const seed = slugify(base) || "project";
  let candidate = seed;
  let n = 2;
  while (await prisma.project.findUnique({ where: { slug: candidate } })) {
    candidate = `${seed}-${n++}`;
  }
  return candidate;
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({
      where: { archivedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        environments: {
          orderBy: { sortOrder: "asc" },
          include: {
            secrets: { where: { deletedAt: null }, select: { id: true } },
          },
        },
      },
    });

    res.json({
      data: projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        secretCount: project.environments.reduce((sum, env) => sum + env.secrets.length, 0),
        environments: project.environments.map((env) => ({
          id: env.id,
          name: env.name,
          slug: env.slug,
          isProduction: env.isProduction,
          sortOrder: env.sortOrder,
          secretCount: env.secrets.length,
        })),
      })),
    });
  }),
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(projectBody, req);
    const slug = await uniqueProjectSlug(body.name);

    const project = await prisma.project.create({
      data: {
        name: body.name,
        slug,
        description: body.description || null,
        environments: { create: DEFAULT_ENVIRONMENTS },
      },
      include: { environments: { orderBy: { sortOrder: "asc" } } },
    });

    await audit({ req, action: "project.created", project });

    res.status(201).json({
      data: {
        ...project,
        environments: project.environments.map((env) => ({
          ...env,
          secretCount: 0,
        })),
      },
    });
  }),
);

router.get(
  "/:projectId",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, archivedAt: null },
      include: {
        environments: {
          orderBy: { sortOrder: "asc" },
          include: {
            secrets: { where: { deletedAt: null }, select: { id: true } },
          },
        },
      },
    });
    if (!project) throw notFound("Project not found.");

    res.json({
      data: {
        ...project,
        environments: project.environments.map((env) => ({
          ...env,
          secretCount: env.secrets.length,
          secrets: undefined,
        })),
      },
    });
  }),
);

router.patch(
  "/:projectId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(projectBody.partial(), req);
    const existing = await prisma.project.findFirst({
      where: { id: req.params.projectId, archivedAt: null },
    });
    if (!existing) throw notFound("Project not found.");

    const project = await prisma.project.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        description: body.description === undefined ? undefined : body.description || null,
      },
      include: { environments: { orderBy: { sortOrder: "asc" } } },
    });

    await audit({ req, action: "project.updated", project });
    res.json({ data: project });
  }),
);

router.delete(
  "/:projectId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, archivedAt: null },
    });
    if (!project) throw notFound("Project not found.");

    await prisma.project.update({
      where: { id: project.id },
      data: { archivedAt: new Date() },
    });
    await audit({ req, action: "project.archived", project });

    res.json({ data: { id: project.id } });
  }),
);

// Environments live under a project for creation.
router.post(
  "/:projectId/environments",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().trim().min(1).max(60),
        isProduction: z.boolean().default(false),
      }),
      req,
    );

    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, archivedAt: null },
      include: { environments: true },
    });
    if (!project) throw notFound("Project not found.");

    const base = slugify(body.name) || "environment";
    let slug = base;
    let n = 2;
    while (project.environments.some((env) => env.slug === slug)) slug = `${base}-${n++}`;

    if (project.environments.length >= 10) {
      throw new HttpError(400, "limit_reached", "A project can have at most 10 environments.");
    }

    const environment = await prisma.environment.create({
      data: {
        projectId: project.id,
        name: body.name,
        slug,
        isProduction: body.isProduction,
        sortOrder: project.environments.length,
      },
    });

    await audit({ req, action: "environment.created", project, environment });
    res.status(201).json({ data: { ...environment, secretCount: 0 } });
  }),
);

export default router;
