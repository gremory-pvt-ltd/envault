import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function parseBody<T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new HttpError(400, "validation_error", "Invalid request body.", result.error.flatten());
  }
  return result.data;
}

export function parseQuery<T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new HttpError(400, "validation_error", "Invalid query parameters.", result.error.flatten());
  }
  return result.data;
}

export function notFound(message = "Not found.") {
  return new HttpError(404, "not_found", message);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Invalid request.", details: err.flatten() },
    });
    return;
  }

  // Prisma unique constraint. Never include the query or values.
  if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
    res.status(409).json({
      error: { code: "conflict", message: "That name is already in use." },
    });
    return;
  }

  console.error("[api] unhandled error:", err instanceof Error ? err.message : err);
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong on the server." },
  });
}
