import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, parseQuery } from "../lib/http.js";

const router = Router();

const querySchema = z.object({
  projectId: z.string().trim().max(64).optional(),
  action: z.string().trim().max(80).optional(),
  actor: z.string().trim().max(200).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseQuery(querySchema, req);

    const events = await prisma.auditEvent.findMany({
      where: {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.actor ? { actorEmail: { contains: query.actor } } : {}),
        ...(query.q
          ? {
              OR: [
                { secretKey: { contains: query.q } },
                { action: { contains: query.q } },
                { actorEmail: { contains: query.q } },
                { projectName: { contains: query.q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });

    res.json({
      data: events.map((event) => {
        let metadata: unknown = null;
        if (event.metadata) {
          try {
            metadata = JSON.parse(event.metadata);
          } catch {
            metadata = null;
          }
        }
        return { ...event, metadata };
      }),
    });
  }),
);

export default router;
