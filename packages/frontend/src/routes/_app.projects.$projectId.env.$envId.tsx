import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  History,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ImportDialog } from "@/components/secrets/import-dialog";
import { HistorySheet } from "@/components/secrets/history-sheet";
import { SecretDialog } from "@/components/secrets/secret-dialog";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type SecretRow } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { secretsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/projects/$projectId/env/$envId")({
  loader: ({ params }) => queryClient.ensureQueryData(secretsQuery(params.envId)),
  component: SecretsPage,
});

const TYPE_STYLES: Record<string, string> = {
  string: "text-muted-foreground",
  url: "text-sky-300",
  number: "text-emerald-300",
  boolean: "text-purple-300",
  json: "text-amber-300",
};

function SecretsPage() {
  const { envId } = Route.useParams();
  const data = useQuery(secretsQuery(envId));

  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SecretRow | null>(null);
  const [historySecret, setHistorySecret] = useState<SecretRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<SecretRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportConfirm, setExportConfirm] = useState("");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const environment = data.data?.environment;
  const project = data.data?.project;

  useEffect(() => {
    const current = timers.current;
    return () => {
      for (const timer of Object.values(current)) clearTimeout(timer);
    };
  }, []);

  function hide(id: string) {
    setRevealed((state) => {
      const next = { ...state };
      delete next[id];
      return next;
    });
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }

  async function reveal(secret: SecretRow, alsoCopy = false) {
    setRevealingId(secret.id);
    try {
      const result = await api.secrets.reveal(secret.id);
      setRevealed((state) => ({ ...state, [secret.id]: result.value }));
      if (timers.current[secret.id]) clearTimeout(timers.current[secret.id]);
      timers.current[secret.id] = setTimeout(() => hide(secret.id), 30_000);
      if (alsoCopy) await copyValue(secret.key, result.value);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reveal that value.");
    } finally {
      setRevealingId(null);
    }
  }

  async function copySecret(secret: SecretRow) {
    const existing = revealed[secret.id];
    if (existing !== undefined) {
      await copyValue(secret.key, existing);
      return;
    }
    await reveal(secret, true);
  }

  const deleteMutation = useMutation({
    mutationFn: (secret: SecretRow) => api.secrets.remove(secret.id),
    onSuccess: async (_result, secret) => {
      hide(secret.id);
      await queryClient.invalidateQueries({ queryKey: ["secrets", envId] });
      await queryClient.invalidateQueries({ queryKey: ["project"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeleting(null);
      toast.success(`${secret.key} deleted.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportMutation = useMutation({
    mutationFn: () => api.secrets.export(envId),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      setExportConfirm("");
      toast.success(`${filename} downloaded.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const secrets = data.data?.secrets ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return secrets;
    return secrets.filter(
      (secret) =>
        secret.key.toLowerCase().includes(q) ||
        (secret.note ?? "").toLowerCase().includes(q),
    );
  }, [secrets, search]);

  const production = environment?.isProduction ?? false;
  const canExport =
    !production || exportConfirm.trim().toLowerCase() === environment?.slug;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {environment?.name ?? "Environment"}
          </span>
        }
        description={
          environment
            ? `${secrets.length} ${secrets.length === 1 ? "key" : "keys"} · reveals and exports are audited`
            : "Loading credentials…"
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <FileUp /> Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExportConfirm("");
                setExportOpen(true);
              }}
              disabled={secrets.length === 0}
            >
              <Download /> Export .env
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus /> Add secret
            </Button>
          </>
        }
      />

      {production && (
        <Alert variant="destructive" className="mt-5 border-red-400/20 bg-red-400/[0.06]">
          <AlertTriangle />
          <AlertTitle>Production credentials</AlertTitle>
          <AlertDescription>
            Every reveal and export is recorded with your name and IP address.
          </AlertDescription>
        </Alert>
      )}

      <div className="relative mt-6 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search keys or notes…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card className="mt-4 gap-0 overflow-hidden p-0">
        {data.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : filtered.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="w-12 pr-5">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((secret) => {
                const value = revealed[secret.id];
                const isRevealed = value !== undefined;
                return (
                  <TableRow key={secret.id} className="group">
                    <TableCell className="max-w-[240px] pl-5">
                      <div className="mono truncate text-[0.8rem] font-medium">{secret.key}</div>
                      {secret.note && (
                        <div className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">
                          {secret.note}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="max-w-[340px]">
                      {revealingId === secret.id ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" /> Revealing…
                        </span>
                      ) : isRevealed ? (
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            className="mono max-h-24 max-w-[320px] cursor-pointer overflow-y-auto text-left text-[0.72rem] break-all whitespace-pre-wrap text-foreground/90 hover:text-foreground"
                            title="Click to copy"
                            onClick={() => copyValue(secret.key, value)}
                          >
                            {value || <span className="text-muted-foreground">(empty)</span>}
                          </button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Hide ${secret.key}`}
                            onClick={() => hide(secret.id)}
                          >
                            <EyeOff />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="mono text-xs tracking-[0.18em] text-muted-foreground/60">
                            ••••••••
                          </span>
                          <span className="text-[0.65rem] text-muted-foreground/50">
                            {secret.valueLength} chars
                          </span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Reveal ${secret.key}`}
                            onClick={() => reveal(secret)}
                          >
                            <Eye />
                          </Button>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <span className={`text-xs ${TYPE_STYLES[secret.type] ?? ""}`}>
                        {secret.type}
                      </span>
                    </TableCell>

                    <TableCell className="hidden lg:table-cell">
                      <div className="text-xs">{relativeTime(secret.updatedAt)}</div>
                      <div className="text-[0.65rem] text-muted-foreground">
                        {secret.updatedByEmail ?? secret.createdByEmail ?? "—"}
                      </div>
                    </TableCell>

                    <TableCell className="pr-5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground opacity-70 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 data-popup-open:bg-muted"
                          aria-label={`Actions for ${secret.key}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => copySecret(secret)}>
                            <Copy /> Copy value
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => reveal(secret)}>
                            <Eye /> Reveal
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(secret);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHistorySecret(secret)}>
                            <History /> History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleting(secret)}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Empty className="rounded-none border-0 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRound />
              </EmptyMedia>
              <EmptyTitle>{search ? "No matching keys" : "No secrets yet"}</EmptyTitle>
              <EmptyDescription>
                {search
                  ? "Try a different search term."
                  : `Add ${environment?.name ?? "this environment"}'s first credential, or import an existing .env file.`}
              </EmptyDescription>
            </EmptyHeader>
            {!search && (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus /> Add secret
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <FileUp /> Import .env
                </Button>
              </div>
            )}
          </Empty>
        )}
      </Card>

      <p className="mt-3 text-[0.7rem] text-muted-foreground">
        Revealed values hide after 30 seconds. Project: {project?.name ?? "…"} · env:{" "}
        {environment?.slug ?? "…"}
      </p>

      <SecretDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        environmentId={envId}
        secret={editing}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        environmentId={envId}
        environmentName={environment?.name ?? "this environment"}
      />

      <HistorySheet
        secret={historySecret}
        environmentId={envId}
        onClose={() => setHistorySecret(null)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.key}?</AlertDialogTitle>
            <AlertDialogDescription>
              The key disappears from the vault and exports. Its version history is retained
              so it can be re-added later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive/10 text-destructive hover:bg-destructive/20"
              disabled={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting)}
            >
              {deleteMutation.isPending && <Loader2 className="animate-spin" />}
              Delete secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={exportOpen} onOpenChange={setExportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export {environment?.name} .env</AlertDialogTitle>
            <AlertDialogDescription>
              This downloads every value in plain text and writes an export event to the audit
              log. Store the file carefully and delete it when you are done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {production && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground" htmlFor="export-confirm">
                Type <span className="mono text-foreground">{environment?.slug}</span> to confirm
              </label>
              <Input
                id="export-confirm"
                value={exportConfirm}
                onChange={(event) => setExportConfirm(event.target.value)}
                placeholder={environment?.slug}
                autoComplete="off"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canExport || exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <Download />}
              Download .env
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

async function copyValue(key: string, value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      // LAN development is plain HTTP, where the async clipboard API is not
      // available. The hidden-textarea fallback still works.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast.success(`${key} copied.`, {
      description: "Clear your clipboard when you are done.",
    });
  } catch {
    toast.error("Copy failed — reveal the value and select it manually.");
  }
}
