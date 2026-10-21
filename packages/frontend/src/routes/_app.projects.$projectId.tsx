import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ArrowLeft, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { projectQuery, sessionQuery } from "@/lib/queries";
import { queryClient } from "@/lib/query-client";

export const Route = createFileRoute("/_app/projects/$projectId")({
  loader: ({ params }) => queryClient.ensureQueryData(projectQuery(params.projectId)),
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const project = useQuery(projectQuery(projectId));
  const session = useQuery(sessionQuery);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAdmin = (session.data?.user as { role?: string } | undefined)?.role === "admin";

  if (project.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-7 lg:px-10 lg:py-10">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-9 w-80" />
      </div>
    );
  }

  if (!project.data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 text-center lg:px-10">
        <p className="text-sm text-muted-foreground">This project could not be loaded.</p>
        <Link to="/" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
          Back to overview
        </Link>
      </div>
    );
  }

  const data = project.data;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 lg:px-10 lg:py-9">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All projects
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-purple-500/25 to-fuchsia-500/10 text-base font-semibold text-purple-200">
            {data.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data.description || "No description"}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Link
            to="/projects/$projectId/settings"
            params={{ projectId: data.id }}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings2 /> Project settings
          </Link>
        )}
      </div>

      <nav className="mt-7 flex gap-1 overflow-x-auto border-b border-border pb-0">
        {data.environments.map((env) => {
          const active = pathname.includes(`/env/${env.id}`);
          return (
            <Link
              key={env.id}
              to="/projects/$projectId/env/$envId"
              params={{ projectId: data.id, envId: env.id }}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                active && "border-purple-400 text-foreground",
              )}
            >
              {env.name}
              {env.isProduction && (
                <Badge
                  variant="outline"
                  className="border-red-400/30 bg-red-400/10 text-[0.6rem] text-red-300"
                >
                  PROD
                </Badge>
              )}
              <span className="text-[0.68rem] tabular-nums text-muted-foreground/60">
                {env.secretCount}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}
