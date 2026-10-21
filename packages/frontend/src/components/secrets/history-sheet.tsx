import { useMutation, useQuery } from "@tanstack/react-query";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type SecretRow } from "@/lib/api";
import { absoluteDate, relativeTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { versionsQuery } from "@/lib/queries";

export function HistorySheet({
  secret,
  environmentId,
  onClose,
}: {
  secret: SecretRow | null;
  environmentId: string;
  onClose: () => void;
}) {
  const versions = useQuery({
    ...versionsQuery(secret?.id ?? null),
    enabled: !!secret,
  });

  const restore = useMutation({
    mutationFn: (version: number) => api.secrets.restore(secret!.id, version),
    onSuccess: async (_data, version) => {
      await queryClient.invalidateQueries({ queryKey: ["secrets", environmentId] });
      await queryClient.invalidateQueries({ queryKey: ["project"] });
      await queryClient.invalidateQueries({ queryKey: ["versions", secret?.id] });
      toast.success(`Restored v${version} as a new version.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open={!!secret} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <span className="mono truncate">{secret?.key}</span>
          </SheetTitle>
          <SheetDescription>
            Every value change is kept. Restoring creates a new version, so history stays intact.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 overflow-y-auto px-1">
          {versions.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : versions.data?.versions.length ? (
            <ol className="relative space-y-3 border-l border-border pl-4">
              {versions.data.versions.map((version) => {
                const current = version.version === versions.data.secret.currentVersion;
                return (
                  <li key={version.id} className="relative">
                    <span className="absolute top-4 -left-[1.32rem] size-2 rounded-full bg-border ring-4 ring-background" />
                    <div className="rounded-2xl border border-border bg-card/60 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">v{version.version}</span>
                          {current && (
                            <Badge variant="secondary" className="text-[0.6rem]">
                              current
                            </Badge>
                          )}
                        </div>
                        <span className="text-[0.68rem] text-muted-foreground">
                          {relativeTime(version.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {version.comment || "Value updated"} ·{" "}
                        {version.createdByEmail || "unknown"}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] text-muted-foreground/60">
                        {absoluteDate(version.createdAt)}
                      </p>
                      {!current && (
                        <Button
                          size="xs"
                          variant="outline"
                          className="mt-2.5"
                          disabled={restore.isPending}
                          onClick={() => restore.mutate(version.version)}
                        >
                          {restore.isPending && restore.variables === version.version ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <RotateCcw />
                          )}
                          Restore this version
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No versions found.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
