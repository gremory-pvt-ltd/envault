import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { projectQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/projects/$projectId/")({
  component: ProjectIndex,
});

function ProjectIndex() {
  const { projectId } = Route.useParams();
  const project = useQuery(projectQuery(projectId));

  if (project.isLoading) return <Skeleton className="h-24 w-full" />;
  const first = project.data?.environments[0];

  if (!first) {
    return (
      <p className="text-sm text-muted-foreground">
        This project has no environments yet. Add one from project settings.
      </p>
    );
  }

  return (
    <Navigate
      to="/projects/$projectId/env/$envId"
      params={{ projectId, envId: first.id }}
      replace
    />
  );
}
