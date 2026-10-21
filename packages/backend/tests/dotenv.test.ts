import assert from "node:assert/strict";
import test from "node:test";
import { parseDotenv, serializeDotenv } from "../src/lib/dotenv.js";

test("parses simple keys, export prefixes, comments and blank lines", () => {
  const result = parseDotenv(`
# database
DATABASE_URL=postgres://localhost/app
export JWT_SECRET=abc123

EMPTY=
  `);

  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.entries.map((entry) => [entry.key, entry.value]),
    [
      ["DATABASE_URL", "postgres://localhost/app"],
      ["JWT_SECRET", "abc123"],
      ["EMPTY", ""],
    ],
  );
});

test("handles quoted values, escapes and inline comments", () => {
  const result = parseDotenv(
    [
      'DOUBLE="line one\\nline two"',
      "SINGLE='keep $and # this'",
      "PLAIN=value # trailing comment",
      'HASH="a # b"',
    ].join("\n"),
  );

  assert.equal(result.errors.length, 0);
  const map = Object.fromEntries(result.entries.map((entry) => [entry.key, entry.value]));
  assert.equal(map.DOUBLE, "line one\nline two");
  assert.equal(map.SINGLE, "keep $and # this");
  assert.equal(map.PLAIN, "value");
  assert.equal(map.HASH, "a # b");
});

test("reports invalid lines, unterminated quotes and duplicate keys", () => {
  const result = parseDotenv(
    ["not a pair", "9BAD=value", 'BROKEN="unterminated', "DUP=1", "DUP=2"].join("\n"),
  );

  assert.equal(result.errors.length, 3);
  assert.deepEqual(
    result.errors.map((error) => error.line),
    [1, 2, 3],
  );
  assert.deepEqual(result.duplicates, ["DUP"]);
  assert.equal(result.entries.find((entry) => entry.key === "DUP")?.value, "1");
});

test("serializes deterministically and round-trips special values", () => {
  const values = [
    { key: "Z_LAST", value: "plain" },
    { key: "A_FIRST", value: "" },
    { key: "SPACES", value: "two words" },
    { key: "MULTI", value: "line1\nline2" },
    { key: "QUOTES", value: 'say "hi"' },
    { key: "HASH", value: "before # after" },
  ];

  const text = serializeDotenv(values);
  const reparsed = parseDotenv(text);

  assert.equal(reparsed.errors.length, 0);
  assert.deepEqual(
    reparsed.entries.map((entry) => entry.key),
    ["A_FIRST", "HASH", "MULTI", "QUOTES", "SPACES", "Z_LAST"],
  );
  const map = Object.fromEntries(reparsed.entries.map((entry) => [entry.key, entry.value]));
  for (const entry of values) assert.equal(map[entry.key], entry.value);
});
