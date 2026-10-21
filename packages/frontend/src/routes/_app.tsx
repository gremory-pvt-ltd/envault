import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import type { SessionUser } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { sessionQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await queryClient.ensureQueryData(sessionQuery);
    if (!session) throw redirect({ to: "/login" });

    return { user: session.user as unknown as SessionUser };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();

  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
