import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

type Preview = Extract<
  Awaited<ReturnType<typeof api.secrets.import>>,
  { entries: unknown }
>;

export function ImportDialog({
  open,
  onOpenChange,
  environmentId,
  environmentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: string;
  environmentName: string;
}) {
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!open) {
      setContent("");
      setPreview(null);
    }
  }, [open]);

  const dryRun = useMutation({
    mutationFn: () => api.secrets.import(environmentId, content, true) as Promise<Preview>,
    onSuccess: (result) => setPreview(result),
    onError: (error: Error) => toast.error(error.message),
  });

  const apply = useMutation({
    mutationFn: () => api.secrets.import(environmentId, content, false),
    onSuccess: async (result) => {
      const summary = result as { created: number; updated: number };
      await queryClient.invalidateQueries({ queryKey: ["secrets", environmentId] });
      await queryClient.invalidateQueries({ queryKey: ["project"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Imported ${summary.created + summary.updated} keys into ${environmentName}.`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import .env</DialogTitle>
          <DialogDescription>
            Paste the contents of an env file. Existing keys get a new version — nothing is
            overwritten silently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            className="mono min-h-56 text-xs"
            placeholder={"DATABASE_URL=postgres://…\nJWT_SECRET=…\n# comments are ignored"}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setPreview(null);
            }}
            spellCheck={false}
            autoComplete="off"
          />

          {preview && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span className="font-medium">
                  {preview.entries.length} keys parsed
                </span>
                <Badge variant="secondary">{preview.counts.create} new</Badge>
                <Badge variant="secondary">{preview.counts.update} updates</Badge>
                {preview.errors.length > 0 && (
                  <Badge variant="outline" className="border-red-400/30 text-red-300">
                    {preview.errors.length} invalid lines
                  </Badge>
                )}
              </div>

              <div className="mt-3 max-h-40 overflow-y-auto">
                <ul className="divide-y divide-border/70 text-xs">
                  {preview.entries.map((entry) => (
                    <li
                      key={entry.key}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <span className="mono truncate">{entry.key}</span>
                      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        <span>{entry.valueLength} chars</span>
                        <Badge
                          variant="outline"
                          className={
                            entry.action === "create"
                              ? "text-emerald-300"
                              : "text-amber-300"
                          }
                        >
                          {entry.action === "create" ? "new" : "update"}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {preview.duplicates.length > 0 && (
                <p className="mt-3 flex items-start gap-2 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Duplicate keys use the last value: {preview.duplicates.join(", ")}
                </p>
              )}
              {preview.errors.slice(0, 5).map((error) => (
                <p key={error.line} className="mt-1.5 flex items-start gap-2 text-xs text-red-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Line {error.line}: {error.message}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {preview ? (
            <Button
              onClick={() => apply.mutate()}
              disabled={apply.isPending || preview.entries.length === 0}
            >
              {apply.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              Import {preview.entries.length} keys
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => dryRun.mutate()}
              disabled={!content.trim() || dryRun.isPending}
            >
              {dryRun.isPending ? <Loader2 className="animate-spin" /> : <FileUp />}
              Preview
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
