import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { absoluteDate, actionLabel, actionTone, relativeTime } from "@/lib/format";
import { auditQuery, projectsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

const ACTIONS = [
  "secret.created",
  "secret.updated",
  "secret.revealed",
  "secret.deleted",
  "secret.restored",
  "secrets.imported",
  "environment.exported",
  "project.created",
  "project.updated",
  "project.archived",
  "environment.created",
  "environment.updated",
  "environment.deleted",
  "member.created",
  "member.updated",
  "member.password_reset",
];

function AuditPage() {
  const [projectId, setProjectId] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");

  const projects = useQuery(projectsQuery);
  const events = useQuery(
    auditQuery({
      projectId: projectId === "all" ? undefined : projectId,
      action: action === "all" ? undefined : action,
      q: search.trim() || undefined,
      limit: 150,
    }),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 lg:px-10 lg:py-9">
      <PageHeader
        title="Audit log"
        description="Every reveal, export and change, attributed and timestamped."
        actions={
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <Activity className="size-3" /> {events.data?.length ?? 0} events
          </Badge>
        }
      />

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search actor, project or key…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select value={projectId} onValueChange={(value) => setProjectId(String(value))}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue>
              {(value) =>
                value === "all"
                  ? "All projects"
                  : (projects.data?.find((project) => project.id === value)?.name ??
                    "All projects")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.data?.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={action} onValueChange={(value) => setAction(String(value))}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue>
              {(value) =>
                value === "all" ? "All actions" : actionLabel(String(value))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {actionLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="mt-4 gap-0 overflow-hidden p-0">
        {events.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : events.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="hidden md:table-cell">IP</TableHead>
                <TableHead className="pr-5 text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data.map((event) => {
                const tone = actionTone(event.action);
                return (
                  <TableRow key={event.id}>
                    <TableCell className="pl-5">
                      <Badge
                        variant="outline"
                        className={
                          tone === "error"
                            ? "border-red-400/30 text-red-300"
                            : tone === "warning"
                              ? "border-amber-400/30 text-amber-300"
                              : tone === "success"
                                ? "border-emerald-400/30 text-emerald-300"
                                : "text-muted-foreground"
                        }
                      >
                        {actionLabel(event.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate text-xs">{event.actorEmail}</div>
                      <div className="truncate text-[0.65rem] text-muted-foreground">
                        {event.action}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate text-xs">
                        {event.secretKey ? (
                          <span className="mono">{event.secretKey}</span>
                        ) : (
                          event.projectName || "Workspace"
                        )}
                      </div>
                      <div className="truncate text-[0.65rem] text-muted-foreground">
                        {event.projectName ?? "—"}
                        {event.environmentName ? ` · ${event.environmentName}` : ""}
                      </div>
                      {event.metadata && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[0.65rem] text-muted-foreground/70 hover:text-foreground">
                            details
                          </summary>
                          <pre className="mono mt-1 max-w-[280px] overflow-x-auto rounded bg-muted p-1.5 text-[0.6rem] leading-relaxed text-muted-foreground">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {event.ip ?? "—"}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="text-xs">{relativeTime(event.createdAt)}</div>
                      <div className="text-[0.65rem] text-muted-foreground">
                        {absoluteDate(event.createdAt)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">No events match these filters.</p>
          </div>
        )}
      </Card>

      <p className="mt-3 text-[0.7rem] text-muted-foreground">
        Showing the latest 150 events. Secret values are never written to this log.
      </p>
    </div>
  );
}
