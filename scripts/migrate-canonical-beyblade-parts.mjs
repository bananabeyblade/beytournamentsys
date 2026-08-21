import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const apply = process.argv.includes("--apply");
const sourceFlag = process.argv.indexOf("--source");
const sourcePath = resolve(
  process.cwd(),
  sourceFlag >= 0 ? process.argv[sourceFlag + 1] : "../parts/parts.json",
);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (sourceFlag >= 0 && !process.argv[sourceFlag + 1]) throw new Error("--source requires a path.");

const master = JSON.parse(await readFile(sourcePath, "utf8")).parts;
const normalize = (value) => String(value ?? "").trim().toUpperCase();
const partFields = [
  "bladeId",
  "lockChipId",
  "mainBladeId",
  "assistBladeId",
  "metalBladeId",
  "overBladeId",
  "ratchetId",
  "bitId",
];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const catalog = await client.query(
    "SELECT id, part_type, code, functional_code, release_date FROM parts WHERE active = TRUE",
  );
const byKey = new Map();
  for (const row of catalog.rows) {
    const key = `${row.part_type}:${normalize(row.functional_code || row.code)}`;
    const matches = byKey.get(key) ?? [];
    matches.push(row);
    byKey.set(key, matches);
  }
  const aliases = [];
  const unresolved = [];
  for (const part of master) {
    const key = `${part.part_type}:${normalize(part.code)}`;
    const matches = byKey.get(key);
    if (matches?.length) aliases.push(...matches.map((match) => [match.id, part.id]));
    else unresolved.push({ id: part.id, type: part.part_type, code: part.code });
  }
  const aliasMap = new Map(aliases);
  const decks = await client.query("SELECT recovery_code_id, combos FROM participant_decks");
  const affectedDecks = decks.rows.filter(({ combos }) =>
    Array.isArray(combos) && combos.some((combo) => partFields.some((field) => aliasMap.has(combo?.[field]))),
  );
  console.table(
    ["blade", "ratchet", "bit", "lock_chip", "main_blade", "assist_blade", "metal_blade", "over_blade"].map(
      (partType) => ({
        partType,
        canonical: master.filter((part) => part.part_type === partType).length,
        mapped: master.filter(
          (part) =>
            part.part_type === partType && byKey.has(`${part.part_type}:${normalize(part.code)}`),
        ).length,
      }),
    ),
  );
  console.log({ canonicalParts: master.length, aliases: aliases.length, unresolved, affectedDecks: affectedDecks.length });
  if (!apply) {
    console.log("Dry run only. Re-run with --apply after database/migration 0017 is present.");
    process.exitCode = unresolved.length ? 1 : 0;
  } else {
    await client.query("BEGIN");
    try {
      for (const part of master) {
        await client.query(
          `INSERT INTO canonical_parts (id,name,name_en,code,part_type,system,release_date,active,source_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,name_en=EXCLUDED.name_en,code=EXCLUDED.code,part_type=EXCLUDED.part_type,system=EXCLUDED.system,release_date=EXCLUDED.release_date,active=EXCLUDED.active,source_url=EXCLUDED.source_url`,
          [part.id, part.name, part.name_en, part.code, part.part_type, part.system, part.release_date, part.active, part.source_url],
        );
      }
      for (const [catalogId, canonicalId] of aliases) {
        await client.query(
          `INSERT INTO catalog_part_aliases (catalog_part_id, canonical_part_id, match_method)
           VALUES ($1,$2,'type_and_code')
           ON CONFLICT (catalog_part_id) DO UPDATE SET canonical_part_id=EXCLUDED.canonical_part_id, match_method=EXCLUDED.match_method`,
          [catalogId, canonicalId],
        );
      }
      for (const deck of affectedDecks) {
        const combos = deck.combos.map((combo) => Object.fromEntries(
          Object.entries(combo).map(([field, value]) => [field, typeof value === "string" ? aliasMap.get(value) || value : value]),
        ));
        await client.query("UPDATE participant_decks SET combos=$2::jsonb, updated_at=now() WHERE recovery_code_id=$1", [deck.recovery_code_id, JSON.stringify(combos)]);
      }
      await client.query("COMMIT");
      console.log("Canonical parts and current Decks migrated. Tournament snapshots were intentionally left unchanged.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
