import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, HttpError, notFound, parseBody } from "../lib/http.js";
import { requireAdmin } from "../middleware.js";
import { slugify } from "./projects.js";

const router = Router();

router.patch(
  "/:environmentId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().trim().min(1).max(60).optional(),
        isProduction: z.boolean().optional(),
      }),
      req,
    );

    const environment = await prisma.environment.findUnique({
      where: { id: req.params.environmentId },
      include: { project: true },
    });
    if (!environment) throw notFound("Environment not found.");

    let slug = environment.slug;
    if (body.name && body.name !== environment.name) {
      const base = slugify(body.name) || "environment";
      slug = base;
      let n = 2;
      while (
        await prisma.environment.findFirst({
          where: { projectId: environment.projectId, slug, NOT: { id: environment.id } },
        })
      ) {
        slug = `${base}-${n++}`;
      }
    }

    const updated = await prisma.environment.update({
      where: { id: environment.id },
      data: { name: body.name, isProduction: body.isProduction, slug },
    });

    await audit({
      req,
      action: "environment.updated",
      project: environment.project,
      environment: updated,
    });
    res.json({ data: updated });
  }),
);

router.delete(
  "/:environmentId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const environment = await prisma.environment.findUnique({
      where: { id: req.params.environmentId },
      include: { project: { include: { environments: true, _count: { select: { environments: true } } } } },
    });
    if (!environment) throw notFound("Environment not found.");

    if (environment.project._count.environments <= 1) {
      throw new HttpError(
        400,
        "last_environment",
        "A project needs at least one environment.",
      );
    }

    await prisma.environment.delete({ where: { id: environment.id } });
    await audit({
      req,
      action: "environment.deleted",
      project: environment.project,
      environment,
    });

    res.json({ data: { id: environment.id } });
  }),
);

export default router;
