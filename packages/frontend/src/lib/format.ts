export function relativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  if (abs < 45) return "just now";

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (abs < 604_800) return formatter.format(Math.round(seconds / 86_400), "day");
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function absoluteDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function actionLabel(action: string): string {
  const [, verb] = action.split(".");
  const labels: Record<string, string> = {
    created: "Created",
    updated: "Updated",
    deleted: "Deleted",
    revealed: "Revealed",
    restored: "Restored",
    imported: "Imported",
    exported: "Exported",
    archived: "Archived",
    password_reset: "Password reset",
  };
  return labels[verb ?? ""] ?? action;
}

export function actionTone(action: string): "success" | "warning" | "error" | "info" | "muted" {
  if (action.endsWith(".deleted") || action.endsWith(".archived")) return "error";
  if (action.endsWith(".revealed") || action.endsWith(".exported")) return "warning";
  if (action.endsWith(".created") || action.endsWith(".imported")) return "success";
  if (action.endsWith(".updated") || action.endsWith(".restored")) return "info";
  return "muted";
}
