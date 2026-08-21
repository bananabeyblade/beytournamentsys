# Canonical Beyblade parts migration

`parts` remains the product-variant catalogue. `canonical_parts` contains the 273 local master parts used by Deck registration, while `catalog_part_aliases` maps old catalogue IDs to their canonical part.

Run the schema migration first, then use the local master file to inspect the mapping:

```powershell
$env:DATABASE_URL = '<Railway Postgres URL>'
npm run db:migrate
npm run parts:canonical:dry-run
```

The dry run reports source parts which have no matching catalogue variant. Review those rows before applying. The apply command imports every canonical part and migrates only currently editable `participant_decks`; it deliberately leaves `tournament_deck_snapshots` untouched for audit history.

```powershell
npm run parts:canonical:apply
```

Use `--source <path>` if the local master is not at `../parts/parts.json`.
