import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import { authClient } from "./auth-client";

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    const result = await authClient.getSession();
    return result.data ?? null;
  },
  staleTime: 30_000,
  retry: false,
});

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: api.projects.list,
});

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: () => api.projects.get(projectId),
  });

export const secretsQuery = (environmentId: string) =>
  queryOptions({
    queryKey: ["secrets", environmentId],
    queryFn: () => api.secrets.list(environmentId),
  });

export const versionsQuery = (secretId: string | null) =>
  queryOptions({
    queryKey: ["versions", secretId],
    queryFn: () => api.secrets.versions(secretId as string),
    enabled: !!secretId,
  });

export const membersQuery = queryOptions({
  queryKey: ["members"],
  queryFn: api.members.list,
});

export const auditQuery = (params: {
  projectId?: string;
  action?: string;
  actor?: string;
  q?: string;
  limit?: number;
}) =>
  queryOptions({
    queryKey: ["audit", params],
    queryFn: () => api.audit.list(params),
  });
