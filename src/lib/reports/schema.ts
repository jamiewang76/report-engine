/**
 * Tiny per-org config schema: one definition drives both validation (on save and at run time)
 * and the generated admin form. Deliberately small: number, boolean, string, string list, and
 * "records" (a repeatable group of the simple types, e.g. one row per pipeline).
 */

type Base = { label: string; help?: string };
export type ScalarField =
  | (Base & { type: "number"; min?: number; max?: number; integer?: boolean; optional?: boolean; default?: number })
  | (Base & { type: "boolean"; default: boolean })
  /** options: allowed values (rendered as a select in the admin form). */
  | (Base & { type: "string"; optional?: boolean; default?: string; options?: { value: string; label: string }[] })
  | (Base & { type: "stringList"; default?: string[] });
export type Field = ScalarField | (Base & { type: "records"; fields: Record<string, ScalarField>; default?: Record<string, unknown>[] });
export type ConfigSchema = Record<string, Field>;

export type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function scalar(f: ScalarField, v: unknown, path: string, errors: Record<string, string>): unknown {
  switch (f.type) {
    case "number":
      if (v == null || v === "") {
        if (f.optional || f.default !== undefined) return f.default ?? null;
        errors[path] = "Required";
        return undefined;
      }
      if (typeof v !== "number" || !Number.isFinite(v)) return void (errors[path] = "Must be a number");
      if (f.min !== undefined && v < f.min) return void (errors[path] = `Must be at least ${f.min}`);
      if (f.max !== undefined && v > f.max) return void (errors[path] = `Must be at most ${f.max}`);
      if (f.integer && !Number.isInteger(v)) return void (errors[path] = "Must be a whole number");
      return v;
    case "boolean":
      if (v == null) return f.default;
      if (typeof v !== "boolean") return void (errors[path] = "Must be true or false");
      return v;
    case "string":
      if (v == null || v === "") {
        if (f.optional || f.default !== undefined) return f.default ?? null;
        errors[path] = "Required";
        return undefined;
      }
      if (typeof v !== "string") return void (errors[path] = "Must be text");
      if (f.options && !f.options.some((o) => o.value === v.trim())) return void (errors[path] = `Must be one of: ${f.options.map((o) => o.value).join(", ")}`);
      return v.trim();
    case "stringList":
      if (v == null) return f.default ?? [];
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return void (errors[path] = "Must be a list of text values");
      return [...new Set(v.map((x) => x.trim()).filter(Boolean))];
  }
}

/** Validates and normalizes a config object. Unknown keys are rejected so typos don't silently do nothing. */
export function validateConfig(schema: ConfigSchema, input: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  const raw = input ?? {};
  if (!isPlainObject(raw)) return { ok: false, errors: { _: "Config must be an object" } };
  for (const k of Object.keys(raw)) if (!(k in schema)) errors[k] = "Unknown setting";

  const value: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(schema)) {
    const v = raw[key];
    if (f.type !== "records") {
      value[key] = scalar(f, v, key, errors);
      continue;
    }
    if (v == null) { value[key] = f.default ?? []; continue; }
    if (!Array.isArray(v)) { errors[key] = "Must be a list"; continue; }
    value[key] = v.map((row, i) => {
      if (!isPlainObject(row)) { errors[`${key}.${i}`] = "Must be an object"; return null; }
      for (const k of Object.keys(row)) if (!(k in f.fields)) errors[`${key}.${i}.${k}`] = "Unknown setting";
      return Object.fromEntries(Object.entries(f.fields).map(([sk, sf]) => [sk, scalar(sf, row[sk], `${key}.${i}.${sk}`, errors)]));
    });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export const defaultConfig = (schema: ConfigSchema) => {
  const r = validateConfig(schema, {});
  return r.ok ? r.value : {};
};

/**
 * Parse the admin form (FormData) into a config object, using the schema for types.
 * Names: `cfg.<key>`, records: `cfg.<key>.<row>.<subkey>`. Lists are one value per line (or comma-separated).
 * Booleans are checkboxes (absent = false). Record rows whose fields are all empty are dropped.
 */
export function configFromForm(schema: ConfigSchema, form: FormData): Record<string, unknown> {
  const get = (name: string) => (form.get(name) == null ? null : String(form.get(name)));
  const parseScalar = (f: ScalarField, name: string): unknown => {
    const s = get(name);
    switch (f.type) {
      case "number": return s == null || s.trim() === "" ? null : Number(s.replace(/[$,\s]/g, ""));
      case "boolean": return s != null;
      case "string": return s == null || s.trim() === "" ? null : s;
      case "stringList": return (s ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    }
  };
  const out: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(schema)) {
    if (f.type !== "records") { out[key] = parseScalar(f, `cfg.${key}`); continue; }
    const rows: Record<string, unknown>[] = [];
    const indexes = new Set<number>();
    for (const name of form.keys()) {
      const m = name.match(new RegExp(`^cfg\\.${key}\\.(\\d+)\\.`));
      if (m) indexes.add(Number(m[1]));
    }
    for (const i of [...indexes].sort((a, b) => a - b)) {
      const row = Object.fromEntries(Object.entries(f.fields).map(([sk, sf]) => [sk, parseScalar(sf, `cfg.${key}.${i}.${sk}`)]));
      const empty = Object.values(row).every((v) => v == null || v === false || (Array.isArray(v) && !v.length));
      if (!empty) rows.push(row);
    }
    out[key] = rows;
  }
  return out;
}
