export interface DotenvEntry {
  key: string;
  value: string;
  line: number;
}

export interface DotenvParseResult {
  entries: DotenvEntry[];
  errors: Array<{ line: number; message: string }>;
  duplicates: string[];
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * Small `.env` parser for paste-in imports. Handles `export`, comments,
 * single/double quotes, escaped newlines, and CRLF without pulling a parser
 * dependency into the server.
 */
export function parseDotenv(input: string): DotenvParseResult {
  const entries: DotenvEntry[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;

    const eq = withoutExport.indexOf("=");
    if (eq === -1) {
      errors.push({ line: lineNumber, message: "Expected KEY=value." });
      return;
    }

    const key = withoutExport.slice(0, eq).trim();
    if (!KEY_RE.test(key)) {
      errors.push({ line: lineNumber, message: `Invalid key "${key}".` });
      return;
    }

    const remainder = withoutExport.slice(eq + 1).trim();
    const parsed = parseValue(remainder);

    if (parsed.error) {
      errors.push({ line: lineNumber, message: parsed.error });
      return;
    }

    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    entries.push({ key, value: parsed.value, line: lineNumber });
  });

  return { entries, errors, duplicates: [...duplicates] };
}

function parseValue(raw: string): { value: string; error?: string } {
  if (raw.startsWith("'")) {
    const end = raw.lastIndexOf("'");
    if (end <= 0) return { value: raw, error: "Unterminated single-quoted value." };
    return { value: raw.slice(1, end) };
  }

  if (raw.startsWith('"')) {
    let out = "";
    let escaped = false;
    let closedAt = -1;

    for (let i = 1; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) {
        out +=
          ch === "n" ? "\n" : ch === "r" ? "\r" : ch === "t" ? "\t" : ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        closedAt = i;
        break;
      }
      out += ch;
    }

    if (closedAt === -1) return { value: out, error: "Unterminated double-quoted value." };

    const trailing = raw.slice(closedAt + 1).trim();
    if (trailing && !trailing.startsWith("#")) {
      return { value: out, error: "Unexpected characters after closing quote." };
    }
    return { value: out };
  }

  // Unquoted: strip an inline comment introduced by whitespace + '#'.
  const commentIndex = raw.search(/\s#/);
  const value = (commentIndex === -1 ? raw : raw.slice(0, commentIndex)).trim();
  return { value };
}

/** Serialize secrets as a deterministic `.env` file. */
export function serializeDotenv(entries: Array<{ key: string; value: string }>): string {
  return entries
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ key, value }) => `${key}=${quoteValue(value)}`)
    .join("\n")
    .concat("\n");
}

function quoteValue(value: string): string {
  if (value === "") return '""';
  if (/[\n\r\t"'#\\ ]/.test(value) || value !== value.trim()) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${escaped}"`;
  }
  return value;
}
