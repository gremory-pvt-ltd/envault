import { cn } from "cn";
import { LockKeyhole } from "lucide-react";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 text-white shadow-lg shadow-purple-950/40">
        <LockKeyhole className="size-4.5" strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="text-[1.05rem] font-semibold tracking-tight text-foreground">
          envault
        </span>
      )}
    </span>
  );
}
