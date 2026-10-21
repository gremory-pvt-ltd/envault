import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, HttpError, notFound, parseBody } from "../lib/http.js";
import { requireAdmin } from "../middleware.js";

const router = Router();

const ROLE = z.enum(["admin", "member"]);

const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  banned: true,
  twoFactorEnabled: true,
  createdAt: true,
} as const;

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const members = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: publicUser,
    });
    res.json({ data: members });
  }),
);

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().trim().email().max(200),
        password: z.string().min(8).max(128).optional(),
        role: ROLE.default("member"),
      }),
      req,
    );

    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, "conflict", "A member with that email already exists.");
    }

    const tempPassword = body.password ?? randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);
    const userId = randomUUID();

    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          name: body.name,
          email,
          emailVerified: true,
          role: body.role,
        },
      }),
      prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        },
      }),
    ]);

    await audit({
      req,
      action: "member.created",
      metadata: { email, role: body.role },
    });

    res.status(201).json({
      data: {
        user: {
          id: userId,
          name: body.name,
          email,
          role: body.role,
          banned: false,
          twoFactorEnabled: false,
          createdAt: new Date(),
        },
        tempPassword: body.password ? undefined : tempPassword,
      },
    });
  }),
);

router.patch(
  "/:userId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z
        .object({
          role: ROLE.optional(),
          banned: z.boolean().optional(),
        })
        .refine((value) => value.role !== undefined || value.banned !== undefined, "Nothing to update."),
      req,
    );

    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) throw notFound("Member not found.");

    if (target.id === req.user?.id && (body.role === "member" || body.banned === true)) {
      throw new HttpError(400, "self_change", "You cannot demote or block your own account.");
    }

    const losingAdmin =
      target.role === "admin" && (body.role === "member" || body.banned === true);

    if (losingAdmin) {
      const adminCount = await prisma.user.count({ where: { role: "admin", banned: false } });
      if (adminCount <= 1) {
        throw new HttpError(400, "last_admin", "At least one active admin is required.");
      }
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        role: body.role,
        banned: body.banned,
        banReason: body.banned === true ? "Blocked by an admin" : body.banned === false ? null : undefined,
        banExpires: body.banned === false ? null : undefined,
      },
      select: publicUser,
    });

    if (body.banned === true) {
      await prisma.session.deleteMany({ where: { userId: target.id } });
    }

    await audit({
      req,
      action: "member.updated",
      metadata: {
        email: target.email,
        role: body.role ?? target.role,
        banned: body.banned ?? target.banned,
      },
    });

    res.json({ data: updated });
  }),
);

router.post(
  "/:userId/reset-password",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) throw notFound("Member not found.");

    const tempPassword = randomBytes(12).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);

    await prisma.account.updateMany({
      where: { userId: target.id, providerId: "credential" },
      data: { password: passwordHash },
    });
    await prisma.session.deleteMany({ where: { userId: target.id } });

    await audit({
      req,
      action: "member.password_reset",
      metadata: { email: target.email },
    });

    res.json({ data: { tempPassword } });
  }),
);

export default router;
