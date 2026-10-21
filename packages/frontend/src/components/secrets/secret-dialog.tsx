import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, type SecretRow } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

const TYPES = [
  { value: "string", label: "Text" },
  { value: "url", label: "URL" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "json", label: "JSON" },
];

export function SecretDialog({
  open,
  onOpenChange,
  environmentId,
  secret,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: string;
  secret: SecretRow | null;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState("string");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setKey(secret?.key ?? "");
    setValue("");
    setType(secret?.type ?? "string");
    setNote(secret?.note ?? "");
  }, [open, secret]);

  const save = useMutation({
    mutationFn: async () => {
      if (secret) {
        return api.secrets.update(secret.id, {
          value: value === "" ? undefined : value,
          type,
          note: note.trim() === "" ? null : note.trim(),
        });
      }
      return api.secrets.create(environmentId, {
        key: key.trim(),
        value,
        type,
        note: note.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["secrets", environmentId] });
      await queryClient.invalidateQueries({ queryKey: ["project"] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(secret ? `${secret.key} updated` : `${key.trim()} added`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSave =
    key.trim().length > 0 && (!secret || value !== "" || type !== secret.type || note !== (secret.note ?? ""));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret ? `Edit ${secret.key}` : "Add secret"}</DialogTitle>
          <DialogDescription>
            {secret
              ? "Saving a new value creates a new version. History is never overwritten."
              : "Keys are stored per environment and can be revealed by any team member."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="secret-key">Key</Label>
            <Input
              id="secret-key"
              className="mono"
              placeholder="DATABASE_URL"
              value={key}
              onChange={(event) => setKey(event.target.value.toUpperCase())}
              disabled={!!secret}
              autoFocus={!secret}
              maxLength={200}
              required
            />
            {!secret && (
              <p className="text-[0.7rem] text-muted-foreground">
                Letters, numbers, underscore, dot and dash. Stored case-sensitively.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret-value">
              Value {secret && <span className="font-normal text-muted-foreground">(blank keeps current)</span>}
            </Label>
            <Textarea
              id="secret-value"
              className="mono min-h-24 text-xs"
              placeholder={secret ? "Leave blank to keep the current value" : "postgres://…"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(next) => setType(String(next))}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value) =>
                      TYPES.find((item) => item.value === value)?.label ?? "Text"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret-note">Note</Label>
              <Input
                id="secret-note"
                placeholder="What is this for?"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {secret ? "Save new version" : "Add secret"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
