import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const MAIN_URL = "https://beyblade.phstudy.org/data/main.json";
const HARDCODED_URL = "https://beyblade.phstudy.org/data/hardcoded.json";
const NAMES_URL = "https://beyblade.phstudy.org/data/part_code_names.json";
const SNAPSHOT_PATH = "database/data/beyblade-x-parts.json";

const PART_TYPES = [
  { key: "BeybladePartsBlade", type: "blade", label: "鋼鐵戰刃" },
  { key: "BeybladePartsRatchet", type: "ratchet", label: "固鎖輪盤" },
  { key: "BeybladePartsBit", type: "bit", label: "軸心", dictionary: "Bit" },
  { key: "BeybladePartsLockChip", type: "lock_chip", label: "紋章鎖" },
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
  --check                  Compare the live source with the committed snapshot.
  --write                  Update the snapshot and generate a PostgreSQL migration.
  --check-database         Compare the normalized source with DATABASE_URL.
  --main-file <path>       Read main.json from disk instead of downloading it.
  --hardcoded-file <path>  Read hardcoded.json from disk instead of downloading it.
  --names-file <path>      Read part_code_names.json from disk instead of downloading it.
  --migration <path>       Override the generated migration path (requires --write).
`);
  process.exit(0);
}

const slug = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sqlString = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

async function readJson(file, url) {
  if (file) return JSON.parse(await readFile(file, "utf8"));
  const response = await fetch(url, {
    headers: { "user-agent": "beytournamentsys-parts-sync/2" },
  });
  if (!response.ok) throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  return response.json();
}

function cleanSourceName(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function selectRepresentative(entries) {
  return [...entries].sort((left, right) =>
    String(left.id || "").localeCompare(String(right.id || ""), "en", { numeric: true }),
  )[0];
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

function mergeMasterdata(...documents) {
  const merged = { data: {} };
  for (const document of documents) {
    for (const [key, rows] of Object.entries(document?.data || {})) {
      const target = (merged.data[key] ||= {});
      for (const [id, row] of Object.entries(rows || {})) {
        if (!(id in target)) target[id] = row;
      }
    }
  }
  return merged;
}

const isCollectionVisible = (row) => Object.values(row?.collection_visible || {}).some(Boolean);

function normalizeSource(mainDocument, hardcodedDocument, nameDictionary) {
  const data = mergeMasterdata(mainDocument, hardcodedDocument).data;
  if (!data || typeof data !== "object") throw new Error("Source data is missing.");

  const report = [];
  const parts = [];

  for (const definition of PART_TYPES) {
    const sourceRows = Object.values(data[definition.key] || {}).filter(Boolean);
    const visibleRows = sourceRows.filter(
      (row) => isCollectionVisible(row) && !String(row.id || "").endsWith("R"),
    );
    const packages = new Map();

    for (const row of visibleRows) {
      const packageKey = String(row.package_id || row.id || "").trim();
      if (!packageKey) continue;
      if (!packages.has(packageKey)) packages.set(packageKey, []);
      packages.get(packageKey).push(row);
    }

    for (const entries of packages.values()) {
      const representative = selectRepresentative(entries);
      const sourcePartId = String(representative.id || "").trim();
      const functionalCode = String(
        representative.group_id || representative.en_name || sourcePartId,
      ).trim();
      const dictionary = nameDictionary[definition.dictionary]?.[functionalCode];
      const localizedName =
        cleanSourceName(representative.name?.["zh-TW"]) ||
        dictionary?.name?.["zh-TW"] ||
        functionalCode;
      const englishName =
        cleanSourceName(representative.name?.["en-US"]) ||
        dictionary?.name?.["en-US"] ||
        String(representative.en_name || functionalCode).trim();

      parts.push({
        id: `beyx:variant:${definition.type}:${slug(sourcePartId)}`,
        name: localizedName,
        nameEn: englishName,
        code: functionalCode,
        partType: definition.type,
        system: inferSystem(representative),
        releaseDate: String(representative.release_at || "").slice(0, 10) || null,
        active: true,
        sourceUrl: MAIN_URL,
        sourcePartId,
        functionalCode,
        packageId: String(representative.package_id || sourcePartId),
        setId: String(representative.set_id || representative.base_set_id || ""),
        color: String(representative.color || ""),
        brandSource: String(representative.brandSource || "TT"),
      });
    }

    report.push({
      type: definition.type,
      label: definition.label,
      sourceRows: sourceRows.length,
      visibleRows: visibleRows.length,
      excludedRows: sourceRows.length - visibleRows.length,
      duplicateRows: visibleRows.length - packages.size,
      variantParts: packages.size,
    });
  }

  parts.sort(
    (left, right) =>
      PART_TYPES.findIndex((item) => item.type === left.partType) -
        PART_TYPES.findIndex((item) => item.type === right.partType) ||
      left.sourcePartId.localeCompare(right.sourcePartId, "en", { numeric: true }),
  );
  return { parts, report };
}

function normalizeSeries(mainDocument, hardcodedDocument) {
  const rows = Object.values(
    mergeMasterdata(mainDocument, hardcodedDocument).data.BeybladeSeries || {},
  ).filter(Boolean);
  const visibleRows = rows.filter((row) => {
    const imageId = String(row.blade_id || row.id || "");
    return isCollectionVisible(row) && !imageId.endsWith("R");
  });
  const packages = new Map();
  for (const row of visibleRows) {
    const packageKey = String(row.package_id || row.id || "").trim();
    if (!packageKey) continue;
    if (!packages.has(packageKey)) packages.set(packageKey, []);
    packages.get(packageKey).push(row);
  }

  const series = [...packages.values()].map((entries) => {
    const row = selectRepresentative(entries);
    const sourceSeriesId = String(row.id || "").trim();
    return {
      id: `beyx:series:${slug(sourceSeriesId)}`,
      name: cleanSourceName(row.name?.["zh-TW"]) || sourceSeriesId,
      nameEn: cleanSourceName(row.name?.["en-US"]) || String(row.en_name || sourceSeriesId),
      sourceSeriesId,
      packageId: String(row.package_id || sourceSeriesId),
      setId: String(row.set_id || row.base_set_id || ""),
      system: inferSystem(row),
      releaseDate: String(row.release_at || "").slice(0, 10) || null,
      bladeId: String(row.blade_id || ""),
      ratchetId: String(row.ratchet_id || ""),
      bitId: String(row.bit_id || ""),
      lockChipId: String(row.lock_chip_id || ""),
      mainBladeId: String(row.main_blade_id || ""),
      assistBladeId: String(row.assist_blade_id || ""),
      metalBladeId: String(row.metal_blade_id || ""),
      overBladeId: String(row.over_blade_id || ""),
      active: true,
      sourceUrl: MAIN_URL,
    };
  });
  series.sort((left, right) =>
    left.sourceSeriesId.localeCompare(right.sourceSeriesId, "en", { numeric: true }),
  );
  return {
    series,
    report: {
      type: "series",
      label: "系列",
      sourceRows: rows.length,
      visibleRows: visibleRows.length,
      excludedRows: rows.length - visibleRows.length,
      duplicateRows: visibleRows.length - packages.size,
      variantParts: packages.size,
    },
  };
}

function stableSnapshot(parts, report, series) {
  const payload = {
    source: { main: MAIN_URL, hardcoded: HARDCODED_URL, names: NAMES_URL },
    counts: report,
    series,
    parts,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function migrationName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  return `database/migrations/${stamp}_sync_beyblade_x_part_variants.sql`;
}

function renderMigration(parts, series) {
  const rows = parts
    .map((part) => {
      const values = [
        part.id,
        part.name,
        part.nameEn,
        part.code,
        part.partType,
        part.system,
        part.releaseDate,
        part.active,
        part.sourceUrl,
        part.sourcePartId,
        part.functionalCode,
        part.packageId,
        part.setId,
        part.color,
        part.brandSource,
      ];
      return `  (${values
        .map((value, index) => {
          if (index === 6) return value ? sqlString(value) : "NULL";
          if (index === 7) return value ? "TRUE" : "FALSE";
          return sqlString(value);
        })
        .join(", ")})`;
    })
    .join(",\n");
  const ids = parts.map((part) => `    ${sqlString(part.id)}`).join(",\n");
  const seriesRows = series
    .map((item) => {
      const values = [
        item.id,
        item.name,
        item.nameEn,
        item.sourceSeriesId,
        item.packageId,
        item.setId,
        item.system,
        item.releaseDate,
        item.bladeId,
        item.ratchetId,
        item.bitId,
        item.lockChipId,
        item.mainBladeId,
        item.assistBladeId,
        item.metalBladeId,
        item.overBladeId,
        item.active,
        item.sourceUrl,
      ];
      return `  (${values
        .map((value, index) => {
          if (index === 7) return value ? sqlString(value) : "NULL";
          if (index === 16) return value ? "TRUE" : "FALSE";
          return sqlString(value);
        })
        .join(", ")})`;
    })
    .join(",\n");
  const seriesIds = series.map((item) => `    ${sqlString(item.id)}`).join(",\n");

  return `-- Generated by scripts/sync-beyblade-parts.mjs.
-- Sources: ${MAIN_URL} and ${HARDCODED_URL}
-- Every visible colour, reprint and product-package variant is a separate row.
ALTER TABLE parts ADD COLUMN IF NOT EXISTS source_part_id TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS functional_code TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS package_id TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS set_id TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS brand_source TEXT NOT NULL DEFAULT 'TT';

CREATE UNIQUE INDEX IF NOT EXISTS parts_source_part_id_idx
  ON parts (source_part_id) WHERE source_part_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS beyblade_series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  source_series_id TEXT NOT NULL UNIQUE,
  package_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  system TEXT NOT NULL,
  release_date DATE,
  blade_id TEXT NOT NULL DEFAULT '',
  ratchet_id TEXT NOT NULL DEFAULT '',
  bit_id TEXT NOT NULL DEFAULT '',
  lock_chip_id TEXT NOT NULL DEFAULT '',
  main_blade_id TEXT NOT NULL DEFAULT '',
  assist_blade_id TEXT NOT NULL DEFAULT '',
  metal_blade_id TEXT NOT NULL DEFAULT '',
  over_blade_id TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source_url TEXT NOT NULL
);

INSERT INTO parts (id, name, name_en, code, part_type, system, release_date, active, source_url, source_part_id, functional_code, package_id, set_id, color, brand_source) VALUES
${rows}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  code = EXCLUDED.code,
  part_type = EXCLUDED.part_type,
  system = EXCLUDED.system,
  release_date = EXCLUDED.release_date,
  active = EXCLUDED.active,
  source_url = EXCLUDED.source_url,
  source_part_id = EXCLUDED.source_part_id,
  functional_code = EXCLUDED.functional_code,
  package_id = EXCLUDED.package_id,
  set_id = EXCLUDED.set_id,
  color = EXCLUDED.color,
  brand_source = EXCLUDED.brand_source;

UPDATE parts
SET active = FALSE
WHERE source_url = ${sqlString(MAIN_URL)}
  AND id NOT IN (
${ids}
  );

INSERT INTO beyblade_series (id, name, name_en, source_series_id, package_id, set_id, system, release_date, blade_id, ratchet_id, bit_id, lock_chip_id, main_blade_id, assist_blade_id, metal_blade_id, over_blade_id, active, source_url) VALUES
${seriesRows}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  source_series_id = EXCLUDED.source_series_id,
  package_id = EXCLUDED.package_id,
  set_id = EXCLUDED.set_id,
  system = EXCLUDED.system,
  release_date = EXCLUDED.release_date,
  blade_id = EXCLUDED.blade_id,
  ratchet_id = EXCLUDED.ratchet_id,
  bit_id = EXCLUDED.bit_id,
  lock_chip_id = EXCLUDED.lock_chip_id,
  main_blade_id = EXCLUDED.main_blade_id,
  assist_blade_id = EXCLUDED.assist_blade_id,
  metal_blade_id = EXCLUDED.metal_blade_id,
  over_blade_id = EXCLUDED.over_blade_id,
  active = EXCLUDED.active,
  source_url = EXCLUDED.source_url;

UPDATE beyblade_series
SET active = FALSE
WHERE source_url = ${sqlString(MAIN_URL)}
  AND id NOT IN (
${seriesIds}
  );
`;
}

function printReport(report) {
  console.table(
    report.map((row) => ({
      category: row.label,
      sourceRows: row.sourceRows,
      visibleRows: row.visibleRows,
      excludedRows: row.excludedRows,
      duplicateRows: row.duplicateRows,
      importedVariants: row.variantParts,
    })),
  );
  console.log(`Total catalog entries: ${report.reduce((sum, row) => sum + row.variantParts, 0)}`);
}

async function compareDatabase(parts) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for --check-database.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      'SELECT id, name, name_en AS "nameEn", code, part_type AS "partType", system, release_date::text AS "releaseDate", active, source_part_id AS "sourcePartId", functional_code AS "functionalCode", package_id AS "packageId", set_id AS "setId", color, brand_source AS "brandSource" FROM parts ORDER BY id',
    );
    const expected = new Map(parts.map((part) => [part.id, part]));
    const actual = new Map(result.rows.map((part) => [part.id, part]));
    const missing = parts.filter((part) => !actual.has(part.id));
    const extra = result.rows.filter((part) => !expected.has(part.id) && part.active);
    const fields = [
      "name",
      "nameEn",
      "code",
      "partType",
      "system",
      "releaseDate",
      "active",
      "sourcePartId",
      "functionalCode",
      "packageId",
      "setId",
      "color",
      "brandSource",
    ];
    const changed = parts.filter((part) => {
      const row = actual.get(part.id);
      return row && fields.some((key) => String(row[key] ?? "") !== String(part[key] ?? ""));
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
const hardcodedDocument = await readJson(option("--hardcoded-file"), HARDCODED_URL);
const nameDictionary = await readJson(option("--names-file"), NAMES_URL);
const { parts, report } = normalizeSource(mainDocument, hardcodedDocument, nameDictionary);
const { series, report: seriesReport } = normalizeSeries(mainDocument, hardcodedDocument);
const fullReport = [seriesReport, ...report];
const snapshot = stableSnapshot(parts, fullReport, series);
printReport(fullReport);

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
    await writeFile(output, renderMigration(parts, series), "utf8");
    console.log(`Updated ${SNAPSHOT_PATH}`);
    console.log(`Generated ${output}`);
  }
}

if (hasFlag("--check-database")) await compareDatabase(parts);
