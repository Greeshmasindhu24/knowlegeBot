import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function addPolicyDrops(sql) {
  return sql.replace(
    /^create policy "([^"]+)" on ([^\s]+)/gim,
    (match, name, table) =>
      `drop policy if exists "${name}" on ${table};\ncreate policy "${name}" on ${table}`
  );
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "database");
let schema = readFileSync(resolve(root, "schema.sql"), "utf8");
let storage = readFileSync(resolve(root, "migrations/003_storage_documents_bucket.sql"), "utf8");
schema = addPolicyDrops(schema);
storage = addPolicyDrops(storage);

const header = [
  "-- =============================================================================",
  "-- Supabase SQL Editor: paste this ENTIRE file contents and click Run.",
  "-- Do NOT paste the file path (e.g. database/schema.sql) — that causes a syntax error.",
  "--",
  "-- Includes schema.sql + storage bucket (003). Migration 002 is omitted (in schema).",
  "-- Auto-drops legacy public.users (integer id) before recreate; safe for fresh/partial applies.",
  "-- Policies use DROP IF EXISTS so re-runs are safer after partial applies.",
  "-- =============================================================================",
  "",
].join("\n");

writeFileSync(
  resolve(root, "supabase-init-all.sql"),
  header + schema.trimEnd() + "\n\n-- --- Storage bucket (migration 003) ---\n\n" + storage.trimEnd() + "\n",
  "utf8"
);
console.log("Regenerated supabase-init-all.sql");
