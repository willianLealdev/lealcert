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

async function main() {
  logger.info("Running database migrations...");
  const migrationDb = drizzle(pool);
  try {
    await migrate(migrationDb, {
      migrationsFolder: path.join(__dirname, "../migrations"),
    });
    logger.info("Database migrations complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists")) {
      logger.warn("Migration skipped — schema already present in database");
    } else {
      throw err;
    }
  }
  await ensureSessionTable();

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
