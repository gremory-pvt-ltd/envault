import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, type EnvironmentSummary } from "@/lib/api";
import { projectQuery, sessionQuery } from "@/lib/queries";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/_app/projects/$projectId/settings")({
  loader: ({ params }) => queryClient.ensureQueryData(projectQuery(params.projectId)),
  component: ProjectSettings,
});

function ProjectSettings() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const project = useQuery(projectQuery(projectId));
  const session = useQuery(sessionQuery);
  const isAdmin = (session.data?.user as { role?: string } | undefined)?.role === "admin";

  const [name, setName] = useState(project.data?.name ?? "");
  const [description, setDescription] = useState(project.data?.description ?? "");
  const [addEnvOpen, setAddEnvOpen] = useState(false);
  const [envName, setEnvName] = useState("");
  const [envProduction, setEnvProduction] = useState(false);
  const [deleteEnv, setDeleteEnv] = useState<EnvironmentSummary | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (project.data && !initialized) {
    setName(project.data.name);
    setDescription(project.data.description ?? "");
    setInitialized(true);
  }

  const saveProject = useMutation({
    mutationFn: () =>
      api.projects.update(projectId, {
        name: name.trim(),
        description: description.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createEnvironment = useMutation({
    mutationFn: () =>
      api.projects.createEnvironment(projectId, {
        name: envName.trim(),
        isProduction: envProduction,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setAddEnvOpen(false);
      setEnvName("");
      setEnvProduction(false);
      toast.success("Environment added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateEnvironment = useMutation({
    mutationFn: (variables: { id: string; isProduction: boolean }) =>
      api.environments.update(variables.id, { isProduction: variables.isProduction }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Environment updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEnvironment = useMutation({
    mutationFn: (environment: EnvironmentSummary) => api.environments.remove(environment.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeleteEnv(null);
      toast.success("Environment deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: () => api.projects.archive(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.removeQueries({ queryKey: ["project", projectId] });
      setArchiveOpen(false);
      toast.success("Project archived.");
      navigate({ to: "/", replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Project settings are available to admins only.
        </p>
      </Card>
    );
  }

  if (project.isLoading) return <Skeleton className="h-72 w-full" />;
  if (!project.data) return <p className="text-sm text-muted-foreground">Project not found.</p>;

  const environments = project.data.environments;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Project settings" description={project.data.name} />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>How the project appears across the vault.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) saveProject.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="settings-name">Name</Label>
              <Input
                id="settings-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-description">Description</Label>
              <Textarea
                id="settings-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || saveProject.isPending || (name === project.data.name && description === (project.data.description ?? ""))}
            >
              {saveProject.isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Environments</CardTitle>
            <CardDescription>
              Each environment has its own keys, versions and export.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddEnvOpen(true)}>
            <Plus /> Add environment
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {environments.map((env) => (
            <div
              key={env.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{env.name}</span>
                  <span className="mono text-[0.65rem] text-muted-foreground">{env.slug}</span>
                  {env.isProduction && (
                    <Badge
                      variant="outline"
                      className="border-red-400/30 bg-red-400/10 text-[0.6rem] text-red-300"
                    >
                      PROD
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {env.secretCount} {env.secretCount === 1 ? "key" : "keys"}
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Production
                <Switch
                  checked={env.isProduction}
                  disabled={updateEnvironment.isPending}
                  onCheckedChange={(checked) =>
                    updateEnvironment.mutate({ id: env.id, isProduction: checked })
                  }
                />
              </label>

              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${env.name}`}
                disabled={environments.length <= 1}
                onClick={() => setDeleteEnv(env)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Archiving hides the project and its credentials from the vault. The data stays in
            SQLite for recovery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={() => setArchiveOpen(true)}>
            <Archive /> Archive project
          </Button>
        </CardContent>
      </Card>

      <Dialog open={addEnvOpen} onOpenChange={setAddEnvOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add environment</DialogTitle>
            <DialogDescription>
              Use a production flag for environments whose reveals and exports need extra care.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (envName.trim()) createEnvironment.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="env-name">Name</Label>
              <Input
                id="env-name"
                placeholder="QA"
                value={envName}
                onChange={(event) => setEnvName(event.target.value)}
                maxLength={60}
                required
                autoFocus
              />
            </div>
            <label className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
              <span>
                <span className="block font-medium">Production environment</span>
                <span className="text-xs text-muted-foreground">
                  Adds the red PROD badge and export confirmation.
                </span>
              </span>
              <Switch checked={envProduction} onCheckedChange={setEnvProduction} />
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddEnvOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!envName.trim() || createEnvironment.isPending}>
                {createEnvironment.isPending && <Loader2 className="animate-spin" />}
                Add environment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteEnv} onOpenChange={(open) => !open && setDeleteEnv(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteEnv?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every secret in this environment is removed with it. This cannot be undone from
              the dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
              disabled={removeEnvironment.isPending}
              onClick={() => deleteEnv && removeEnvironment.mutate(deleteEnv)}
            >
              {removeEnvironment.isPending && <Loader2 className="animate-spin" />}
              Delete environment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {project.data.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Type the project name to confirm. The vault stops listing it immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={archiveConfirm}
            onChange={(event) => setArchiveConfirm(event.target.value)}
            placeholder={project.data.name}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
              disabled={archiveConfirm !== project.data.name || archive.isPending}
              onClick={() => archive.mutate()}
            >
              {archive.isPending && <Loader2 className="animate-spin" />}
              Archive project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
