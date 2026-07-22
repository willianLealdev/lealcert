import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { pool, db, usersTable } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seed() {
  const [{ value }] = await db.select({ value: count() }).from(usersTable);
  if (value > 0) return;

  logger.info("Seeding initial admin user...");
  const adminHash = await bcrypt.hash("admin123", 10);
  const contadorHash = await bcrypt.hash("contador123", 10);

  await db.insert(usersTable).values([
    {
      cpfCnpj: "37147329856",
      name: "Admin",
      role: "admin",
      passwordHash: adminHash,
      email: "Willianlealusa@gmail.com",
      phone: "11999999999",
      emailVerified: true,
    },
    {
      cpfCnpj: "12345678900",
      name: "Contador",
      role: "contador",
      passwordHash: contadorHash,
      email: "contador@lealcert.com.br",
      phone: "11888888888",
      emailVerified: true,
    },
  ]);

  logger.info("Admin user created: CPF 00000000000 / senha admin123");
}

async function ensureSessionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

async function ensureMarketingColumns() {
  await pool.query(`
    ALTER TABLE marketing_campaigns
      ADD COLUMN IF NOT EXISTS scheduled_included_providers text,
      ADD COLUMN IF NOT EXISTS manual_pause boolean NOT NULL DEFAULT false;
  `);
}

async function main() {
  logger.info("Running database migrations...");
  const migrationDb = drizzle(pool);

  // If the DB was bootstrapped via drizzle-kit push (no tracking table),
  // seed the migration tracking so Drizzle only runs new migrations.
  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  const { rows: existingMigrations } = await pool.query(
    `SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
  );
  if (existingMigrations.length === 0) {
    // Check if the schema is already present (bootstrapped via push)
    const { rows: typeRows } = await pool.query(
      `SELECT 1 FROM pg_type WHERE typname = 'role' AND typtype = 'e' LIMIT 1`,
    );
    if (typeRows.length > 0) {
      // Schema exists but migration tracking is empty — seed the 0000 entry
      logger.warn("Schema already present but migration tracking is empty — seeding 0000 migration record");
      await pool.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        ["bfa8f0711944c5051e127a100a8abbbceffe8b68e6361c7536b6e126251f9574", 1781994430142],
      );
    }
  }

  await migrate(migrationDb, {
    migrationsFolder: path.join(__dirname, "../migrations"),
  });
  logger.info("Database migrations complete");
  await ensureSessionTable();
  await ensureMarketingColumns();

  await seed();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startScheduler();
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
