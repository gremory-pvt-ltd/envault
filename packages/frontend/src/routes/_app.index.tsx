import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  FolderKanban,
  KeyRound,
  Layers,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { actionLabel, actionTone, relativeTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { auditQuery, projectsQuery, sessionQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/")({
  loader: () => queryClient.ensureQueryData(projectsQuery).catch(() => null),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const projects = useQuery(projectsQuery);
  const session = useQuery(sessionQuery);
  const activity = useQuery(auditQuery({ limit: 7 }));
  const [createOpen, setCreateOpen] = useState(false);

  const isAdmin = (session.data?.user as { role?: string } | undefined)?.role === "admin";

  const totalSecrets = projects.data?.reduce((sum, project) => sum + project.secretCount, 0) ?? 0;
  const totalEnvironments =
    projects.data?.reduce((sum, project) => sum + project.environments.length, 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 lg:px-10 lg:py-10">
      <PageHeader
        title="Overview"
        description="Every project's credentials, one reveal away."
        actions={
          isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New project
            </Button>
          )
        }
      />

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          icon={<FolderKanban className="size-4" />}
          label="Projects"
          value={projects.data?.length ?? "—"}
          loading={projects.isLoading}
        />
        <Stat
          icon={<KeyRound className="size-4" />}
          label="Secrets"
          value={totalSecrets}
          loading={projects.isLoading}
        />
        <Stat
          icon={<Layers className="size-4" />}
          label="Environments"
          value={totalEnvironments}
          loading={projects.isLoading}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="mt-10 grid gap-8 xl:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Projects</h2>
            <span className="text-xs text-muted-foreground">
              {projects.data?.length ?? 0} total
            </span>
          </div>

          {projects.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : projects.data?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.data.map((project) => {
                const first = project.environments[0];
                return (
                  <Link
                    key={project.id}
                    to={first ? "/projects/$projectId/env/$envId" : "/projects/$projectId"}
                    params={
                      first
                        ? { projectId: project.id, envId: first.id }
                        : { projectId: project.id }
                    }
                    className="group"
                  >
                    <Card className="h-full gap-4 p-5 transition-colors ring-foreground/8 hover:bg-card/70 hover:ring-purple-500/30">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-purple-500/25 to-fuchsia-500/10 text-sm font-semibold text-purple-200">
                          {project.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-[0.95rem] font-medium">{project.name}</h3>
                            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {project.description || "No description"}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {project.environments.map((env) => (
                          <Badge
                            key={env.id}
                            variant="secondary"
                            className="gap-1.5 font-normal text-muted-foreground"
                          >
                            {env.isProduction && (
                              <span className="size-1.5 rounded-full bg-red-400" />
                            )}
                            {env.name}
                            <span className="tabular-nums text-foreground/70">
                              {env.secretCount}
                            </span>
                          </Badge>
                        ))}
                      </div>

                      <div className="mt-auto flex items-center justify-between text-[0.7rem] text-muted-foreground">
                        <span>{project.secretCount} secrets</span>
                        <span>Updated {relativeTime(project.updatedAt)}</span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty className="rounded-2xl border border-dashed border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanban />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>
                  Create a project to start storing its environment credentials.
                </EmptyDescription>
              </EmptyHeader>
              {isAdmin && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus /> New project
                </Button>
              )}
            </Empty>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
            <Link to="/audit" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <Card className="gap-0 overflow-hidden p-0">
            {activity.isLoading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-9" />
                ))}
              </div>
            ) : activity.data?.length ? (
              <ul className="divide-y divide-border">
                {activity.data.map((event) => (
                  <li key={event.id} className="flex gap-3 px-4 py-3">
                    <ActivityDot action={event.action} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs">
                        <span className="font-medium">{event.actorEmail}</span>{" "}
                        <span className="text-muted-foreground">
                          {actionLabel(event.action).toLowerCase()}
                        </span>{" "}
                        {event.secretKey && (
                          <span className="mono text-[0.7rem] text-foreground/80">
                            {event.secretKey}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">
                        {event.projectName ?? "Workspace"}
                        {event.environmentName ? ` · ${event.environmentName}` : ""} ·{" "}
                        {relativeTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Activity will show up here.
              </div>
            )}
          </Card>
        </section>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} navigate={navigate} />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  loading,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={`gap-2 p-4 ${className ?? ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-muted text-foreground/70">
          {icon}
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-12" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      )}
    </Card>
  );
}

function ActivityDot({ action }: { action: string }) {
  const tone = actionTone(action);
  const color =
    tone === "error"
      ? "bg-red-400/15 text-red-300"
      : tone === "warning"
        ? "bg-amber-400/15 text-amber-300"
        : tone === "success"
          ? "bg-emerald-400/15 text-emerald-300"
          : "bg-purple-400/15 text-purple-300";

  return (
    <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${color}`}>
      <span className="size-1.5 rounded-full bg-current" />
    </span>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  navigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () => api.projects.create({ name: name.trim(), description: description.trim() }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`${project.name} created with 3 environments.`);
      onOpenChange(false);
      setName("");
      setDescription("");
      const first = project.environments?.[0];
      if (first) {
        navigate({
          to: "/projects/$projectId/env/$envId",
          params: { projectId: project.id, envId: first.id },
        });
      } else {
        navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Development, staging and production environments are created automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="WorkJungle"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              placeholder="Hapi + Next monorepo"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
