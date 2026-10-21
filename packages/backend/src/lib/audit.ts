import type { Request } from "express";
import { prisma } from "../db.js";

interface AuditInput {
  req: Request;
  action: string;
  project?: { id: string; name: string } | null;
  environment?: { id: string; name: string } | null;
  secretKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append an audit event. Callers must never pass secret values in `metadata`.
 */
export async function audit(input: AuditInput) {
  const { req } = input;
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: req.user?.id ?? null,
        actorEmail: req.user?.email ?? "system",
        action: input.action,
        projectId: input.project?.id ?? null,
        projectName: input.project?.name ?? null,
        environmentId: input.environment?.id ?? null,
        environmentName: input.environment?.name ?? null,
        secretKey: input.secretKey ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        ip: req.ip ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 400) ?? null,
      },
    });
  } catch (error) {
    // Auditing must never take the primary action down.
    console.error("[audit] failed to write event:", error instanceof Error ? error.message : error);
  }
}
