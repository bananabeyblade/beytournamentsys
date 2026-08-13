import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const MAIN_URL = "https://beyblade.phstudy.org/data/main.json";
const NAMES_URL = "https://beyblade.phstudy.org/data/part_code_names.json";
const SNAPSHOT_PATH = "database/data/beyblade-x-parts.json";

const PART_TYPES = [
  { key: "BeybladePartsBlade", type: "blade", label: "戰刃" },
  { key: "BeybladePartsRatchet", type: "ratchet", label: "固鎖" },
  { key: "BeybladePartsBit", type: "bit", label: "軸心", dictionary: "Bit" },
  { key: "BeybladePartsLockChip", type: "lock_chip", label: "鎖定紋章" },
  { key: "BeybladePartsMainBlade", type: "main_blade", label: "主要戰刃" },
  {
    key: "BeybladePartsAssistBlade",
    type: "assist_blade",
    label: "輔助戰刃",
    dictionary: "AssistBlade",
  },
  { key: "BeybladePartsMetalBlade", type: "metal_blade", label: "金屬戰刃" },
  {
    key: "BeybladePartsOverBlade",
    type: "over_blade",
    label: "超越戰刃",
    dictionary: "OverBlade",
  },
];

const EXCLUDED_IDENTITIES = new Set(["blade:bit", "ratchet:ratchetintegrated"]);
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (hasFlag("--help")) {
  console.log(`Usage:
  npm run parts:check
  npm run parts:update
  npm run parts:database

Options:
  --check                 Compare the live source with the committed snapshot.
  --write                 Update the snapshot and generate a PostgreSQL migration.
  --check-database        Compare the normalized source with DATABASE_URL.
  --main-file <path>      Read main.json from disk instead of downloading it.
  --names-file <path>     Read part_code_names.json from disk instead of downloading it.
  --migration <path>      Override the generated migration path (requires --write).
`);
  process.exit(0);
}

const normalizeIdentity = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const slug = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sqlString = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

async function readJson(file, url) {
  if (file) return JSON.parse(await readFile(file, "utf8"));
  const response = await fetch(url, { headers: { "user-agent": "beytournamentsys-parts-sync/1" } });
  if (!response.ok) throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  return response.json();
}

function cleanLocalizedName(value, type) {
  if (typeof value !== "string") return "";
  let result = value
    .replace(/^[A-Z]{2,5}(?:-[A-Z0-9]+)+\s+/i, "")
    .replace(/\s+(?:金屬塗層|鋼鐵鍍膜|鋼鐵戰刃|藍鋼鐵鍍膜).*$/u, "")
    .trim();
  if (type === "main_blade") result = result.replace(/^[A-Z]+[／/]\s*/i, "");
  return result;
}

function selectRepresentative(entries) {
  return [...entries].sort((left, right) => {
    const leftDate = left.release_at || "9999";
    const rightDate = right.release_at || "9999";
    return leftDate.localeCompare(rightDate) || String(left.id).localeCompare(String(right.id));
  })[0];
}

function inferSystem(entry) {
  const prefix = String(entry.set_id || entry.base_set_id || "")
    .split("-")[0]
    .toUpperCase();
  const tags = new Set(entry.tags || []);
  if (prefix === "CX" || tags.has("cx")) return "CX";
  if (prefix === "UX" || tags.has("ux")) return "UX";
  if (prefix === "BXG") return "BXG";
  return "BX";
}

function normalizeSource(mainDocument, nameDictionary) {
  const data = mainDocument.data;
  if (!data || typeof data !== "object") throw new Error("main.json does not contain data.");

  const report = [];
  const parts = [];

  for (const definition of PART_TYPES) {
    const sourceRows = Object.values(data[definition.key] || {});
    const validRows = sourceRows.filter((row) => row && row.invalid !== true);
    const groups = new Map();
    let excludedRows = sourceRows.length - validRows.length;

    for (const row of validRows) {
      const identity = String(row.group_id || row.en_name || "").trim();
      if (!identity) {
        excludedRows += 1;
        continue;
      }
      const normalized = normalizeIdentity(identity);
      if (!normalized || EXCLUDED_IDENTITIES.has(`${definition.type}:${normalized}`)) {
        excludedRows += 1;
        continue;
      }
      if (!groups.has(normalized)) groups.set(normalized, []);
      groups.get(normalized).push(row);
    }

    for (const entries of groups.values()) {
      const representative = selectRepresentative(entries);
      const identity = String(representative.group_id || representative.en_name).trim();
      const code = identity;
      const dictionary = nameDictionary[definition.dictionary]?.[code];
      const localizedName =
        dictionary?.name?.["zh-TW"] ||
        cleanLocalizedName(representative.name?.["zh-TW"], definition.type) ||
        code;
      const englishName =
        dictionary?.name?.["en-US"] || String(representative.en_name || code).trim();
      const releaseDates = entries
        .map((row) => String(row.release_at || "").slice(0, 10))
        .filter(Boolean)
        .sort();

      parts.push({
        id: `beyx:${definition.type}:${slug(identity)}`,
        name: localizedName,
        nameEn: englishName,
        code,
        partType: definition.type,
        system: inferSystem(representative),
        releaseDate: releaseDates[0] || null,
        active: true,
        sourceUrl: MAIN_URL,
      });
    }

    report.push({
      type: definition.type,
      label: definition.label,
      sourceRows: sourceRows.length,
      validRows: validRows.length,
      excludedRows,
      functionalParts: groups.size,
    });
  }

  parts.sort(
    (left, right) =>
      PART_TYPES.findIndex((item) => item.type === left.partType) -
        PART_TYPES.findIndex((item) => item.type === right.partType) ||
      left.code.localeCompare(right.code, "en", { numeric: true }),
  );
  return { parts, report };
}

function stableSnapshot(parts, report) {
  const payload = { source: { main: MAIN_URL, names: NAMES_URL }, counts: report, parts };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function migrationName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  return `database/migrations/${stamp}_sync_beyblade_x_parts.sql`;
}

function renderMigration(parts) {
  const rows = parts
    .map(
      (part) =>
        `  (${[
          part.id,
          part.name,
          part.nameEn,
          part.code,
          part.partType,
          part.system,
          part.releaseDate,
          part.active,
          part.sourceUrl,
        ]
          .map((value, index) => {
            if (index === 6) return value ? sqlString(value) : "NULL";
            if (index === 7) return value ? "TRUE" : "FALSE";
            return sqlString(value);
          })
          .join(", ")})`,
    )
    .join(",\n");
  const ids = parts.map((part) => `    ${sqlString(part.id)}`).join(",\n");

  return `-- Generated by scripts/sync-beyblade-parts.mjs.
-- Source: ${MAIN_URL}
-- Functional parts are deduplicated by source group_id; colour and package variants are not separate rows.
INSERT INTO parts (id, name, name_en, code, part_type, system, release_date, active, source_url) VALUES
${rows}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  code = EXCLUDED.code,
  part_type = EXCLUDED.part_type,
  system = EXCLUDED.system,
  release_date = EXCLUDED.release_date,
  active = EXCLUDED.active,
  source_url = EXCLUDED.source_url;

UPDATE parts
SET active = FALSE
WHERE source_url = ${sqlString(MAIN_URL)}
  AND id NOT IN (
${ids}
  );

DELETE FROM parts
WHERE id IN ('beyx:blade:bit', 'beyx:ratchet:ratchet-integrated');
`;
}

function printReport(report) {
  console.table(
    report.map((row) => ({
      類別: row.label,
      來源總列數: row.sourceRows,
      來源有效列數: row.validRows,
      排除異常列數: row.excludedRows,
      功能零件數: row.functionalParts,
    })),
  );
  console.log(
    `Total functional parts: ${report.reduce((sum, row) => sum + row.functionalParts, 0)}`,
  );
}

async function compareDatabase(parts) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for --check-database.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      'SELECT id, name, name_en AS "nameEn", code, part_type AS "partType", system, release_date::text AS "releaseDate", active FROM parts ORDER BY id',
    );
    const expected = new Map(parts.map((part) => [part.id, part]));
    const actual = new Map(result.rows.map((part) => [part.id, part]));
    const missing = parts.filter((part) => !actual.has(part.id));
    const extra = result.rows.filter((part) => !expected.has(part.id) && part.active);
    const changed = parts.filter((part) => {
      const row = actual.get(part.id);
      return (
        row &&
        ["name", "nameEn", "code", "partType", "system", "releaseDate", "active"].some(
          (key) => String(row[key] ?? "") !== String(part[key] ?? ""),
        )
      );
    });
    console.log({
      databaseRows: result.rowCount,
      missing: missing.length,
      changed: changed.length,
      extra: extra.length,
    });
    if (missing.length || changed.length || extra.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

const mainDocument = await readJson(option("--main-file"), MAIN_URL);
const nameDictionary = await readJson(option("--names-file"), NAMES_URL);
const { parts, report } = normalizeSource(mainDocument, nameDictionary);
const snapshot = stableSnapshot(parts, report);
printReport(report);

if (hasFlag("--check")) {
  const committed = await readFile(SNAPSHOT_PATH, "utf8").catch(() => "");
  const currentHash = createHash("sha256").update(snapshot).digest("hex");
  const committedHash = createHash("sha256").update(committed).digest("hex");
  if (currentHash !== committedHash) {
    console.error(
      "The live source differs from the committed parts snapshot. Run npm run parts:update.",
    );
    process.exitCode = 1;
  } else {
    console.log("The committed parts snapshot matches the live source.");
  }
}

if (hasFlag("--write")) {
  const explicitMigration = option("--migration");
  const committed = await readFile(SNAPSHOT_PATH, "utf8").catch(() => "");
  if (committed === snapshot && !explicitMigration) {
    console.log("No source changes detected; no migration was generated.");
  } else {
    const output = explicitMigration || migrationName();
    await mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(SNAPSHOT_PATH, snapshot, "utf8");
    await writeFile(output, renderMigration(parts), "utf8");
    console.log(`Updated ${SNAPSHOT_PATH}`);
    console.log(`Generated ${output}`);
  }
}

if (hasFlag("--check-database")) await compareDatabase(parts);
