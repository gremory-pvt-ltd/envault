import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import type { SessionUser } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { projectsQuery } from "@/lib/queries";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <SidebarContent user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 lg:hidden">
          <Logo />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>envault navigation</SheetDescription>
          </SheetHeader>
          <SidebarContent user={user} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: SessionUser;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { data: projects } = useQuery(projectsQuery);

  const nav = [
    { to: "/", label: "Overview", icon: LayoutDashboard },
    { to: "/audit", label: "Audit log", icon: Activity },
    { to: "/team", label: "Team", icon: Users },
    { to: "/settings", label: "Settings", icon: Settings },
  ] as const;

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
    navigate({ to: "/login", replace: true });
  }

  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to="/" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        {nav.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                active && "bg-sidebar-accent text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}

        <div className="mt-6 mb-1 flex items-center justify-between px-3">
          <span className="text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground/70 uppercase">
            Projects
          </span>
          <FolderKanban className="size-3.5 text-muted-foreground/50" />
        </div>

        {projects?.length ? (
          projects.map((project) => {
            const active = pathname.startsWith(`/projects/${project.id}`);
            return (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  active && "bg-sidebar-accent text-foreground",
                )}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-purple-500/15 text-[0.65rem] font-semibold text-purple-300">
                  {project.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{project.name}</span>
                <span className="ml-auto text-[0.68rem] tabular-nums text-muted-foreground/60">
                  {project.secretCount}
                </span>
              </Link>
            );
          })
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground/70">
            {projects ? "No projects yet." : "Loading…"}
          </p>
        )}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors outline-none hover:bg-sidebar-accent">
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-fuchsia-500/30 to-violet-600/30 text-[0.7rem] font-semibold text-purple-100">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{user.name}</span>
                {user.role === "admin" && (
                  <ShieldCheck className="size-3.5 shrink-0 text-purple-300" />
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="truncate">{user.name}</span>
              <Badge variant="secondary" className="text-[0.6rem] uppercase">
                {user.role}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onNavigate?.();
                navigate({ to: "/settings" });
              }}
            >
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={signOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
