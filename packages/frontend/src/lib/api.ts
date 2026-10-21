import { API_URL } from "./auth-client";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | string;
  twoFactorEnabled?: boolean | null;
  createdAt?: string;
}

export interface EnvironmentSummary {
  id: string;
  name: string;
  slug: string;
  isProduction: boolean;
  sortOrder: number;
  secretCount: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  secretCount: number;
  environments: EnvironmentSummary[];
}

export interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  environments: EnvironmentSummary[];
}

export interface SecretRow {
  id: string;
  key: string;
  type: string;
  note: string | null;
  currentVersion: number;
  valueLength: number;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string | null;
  updatedByEmail: string | null;
}

export interface SecretsResponse {
  environment: {
    id: string;
    name: string;
    slug: string;
    isProduction: boolean;
    projectId: string;
  };
  project: { id: string; name: string; slug: string };
  secrets: SecretRow[];
}

export interface SecretVersion {
  id: string;
  version: number;
  comment: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  projectId: string | null;
  projectName: string | null;
  environmentId: string | null;
  environmentName: string | null;
  secretKey: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | string | null;
  banned: boolean | null;
  twoFactorEnabled: boolean | null;
  createdAt: string;
}

export class ApiError extends Error {
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

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let code = "request_failed";
    let message = `Request failed (${response.status}).`;
    let details: unknown;

    if ((response.headers.get("content-type") ?? "").includes("application/json")) {
      try {
        const payload = (await response.json()) as {
          error?: { code?: string; message?: string; details?: unknown };
        };
        code = payload.error?.code ?? code;
        message = payload.error?.message ?? message;
        details = payload.error?.details;
      } catch {
        // Keep the generic message.
      }
    }

    throw new ApiError(response.status, code, message, details);
  }

  if (response.status === 204) return undefined as T;

  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    const payload = (await response.json()) as { data: T };
    return payload.data;
  }

  return (await response.text()) as T;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const api = {
  me: () => request<SessionUser>("/api/me"),

  projects: {
    list: () => request<ProjectSummary[]>("/api/projects"),
    get: (projectId: string) => request<ProjectDetail>(`/api/projects/${projectId}`),
    create: (body: { name: string; description?: string }) =>
      request<ProjectSummary>("/api/projects", { method: "POST", body }),
    update: (projectId: string, body: { name?: string; description?: string }) =>
      request<ProjectDetail>(`/api/projects/${projectId}`, { method: "PATCH", body }),
    archive: (projectId: string) =>
      request<{ id: string }>(`/api/projects/${projectId}`, { method: "DELETE" }),
    createEnvironment: (
      projectId: string,
      body: { name: string; isProduction?: boolean },
    ) =>
      request<EnvironmentSummary>(`/api/projects/${projectId}/environments`, {
        method: "POST",
        body,
      }),
  },

  environments: {
    update: (
      environmentId: string,
      body: { name?: string; isProduction?: boolean },
    ) =>
      request<EnvironmentSummary>(`/api/environments/${environmentId}`, {
        method: "PATCH",
        body,
      }),
    remove: (environmentId: string) =>
      request<{ id: string }>(`/api/environments/${environmentId}`, { method: "DELETE" }),
  },

  secrets: {
    list: (environmentId: string, q?: string) =>
      request<SecretsResponse>(
        `/api/environments/${environmentId}/secrets${query({ q })}`,
      ),
    create: (
      environmentId: string,
      body: { key: string; value: string; type?: string; note?: string },
    ) =>
      request<{ id: string; key: string; version: number }>(
        `/api/environments/${environmentId}/secrets`,
        { method: "POST", body },
      ),
    update: (
      secretId: string,
      body: { value?: string; type?: string; note?: string | null },
    ) =>
      request<{ id: string; key: string; version: number }>(`/api/secrets/${secretId}`, {
        method: "PATCH",
        body,
      }),
    remove: (secretId: string) =>
      request<{ id: string }>(`/api/secrets/${secretId}`, { method: "DELETE" }),
    reveal: (secretId: string) =>
      request<{ id: string; key: string; value: string; version: number }>(
        `/api/secrets/${secretId}/reveal`,
        { method: "POST", body: {} },
      ),
    versions: (secretId: string) =>
      request<{
        secret: { id: string; key: string; currentVersion: number };
        versions: SecretVersion[];
      }>(`/api/secrets/${secretId}/versions`),
    restore: (secretId: string, version: number) =>
      request<{ id: string; version: number }>(
        `/api/secrets/${secretId}/versions/${version}/restore`,
        { method: "POST", body: {} },
      ),
    import: (environmentId: string, content: string, dryRun: boolean) =>
      request<
        | {
            entries: Array<{ key: string; action: "create" | "update"; valueLength: number }>;
            errors: Array<{ line: number; message: string }>;
            duplicates: string[];
            counts: { create: number; update: number };
          }
        | {
            created: number;
            updated: number;
            invalid: Array<{ line: number; message: string }>;
            duplicates: string[];
          }
      >(`/api/environments/${environmentId}/import`, {
        method: "POST",
        body: { content, dryRun },
      }),
    export: async (environmentId: string) => {
      const response = await fetch(
        `${API_URL}/api/environments/${environmentId}/export`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );

      if (!response.ok) {
        let message = "Export failed.";
        try {
          const payload = (await response.json()) as { error?: { message?: string } };
          message = payload.error?.message ?? message;
        } catch {
          // Ignore.
        }
        throw new ApiError(response.status, "export_failed", message);
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      return {
        blob: await response.blob(),
        filename: match?.[1] ?? "envault.env",
      };
    },
  },

  audit: {
    list: (params: {
      projectId?: string;
      action?: string;
      actor?: string;
      q?: string;
      limit?: number;
    } = {}) => request<AuditEvent[]>(`/api/audit${query(params)}`),
  },

  members: {
    list: () => request<Member[]>("/api/members"),
    create: (body: {
      name: string;
      email: string;
      password?: string;
      role: "admin" | "member";
    }) =>
      request<{ user: Member; tempPassword?: string }>("/api/members", {
        method: "POST",
        body,
      }),
    update: (userId: string, body: { role?: string; banned?: boolean }) =>
      request<Member>(`/api/members/${userId}`, { method: "PATCH", body }),
    resetPassword: (userId: string) =>
      request<{ tempPassword: string }>(`/api/members/${userId}/reset-password`, {
        method: "POST",
        body: {},
      }),
  },
};
