import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const { rows } = await client.query("SELECT current_database() AS database, now() AS checked_at");
  console.log(rows[0]);
} finally {
  await client.end();
}
