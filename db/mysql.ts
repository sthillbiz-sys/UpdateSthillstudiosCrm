import dotenv from "dotenv";
import knex, { type Knex } from "knex";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ override: false });

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveSslConfig() {
  if (process.env.MYSQL_SSL !== "true") {
    return false;
  }

  if (process.env.MYSQL_SSL_CA_BASE64) {
    return {
      ca: Buffer.from(process.env.MYSQL_SSL_CA_BASE64, "base64").toString("utf8"),
      rejectUnauthorized: true,
    };
  }

  return {
    rejectUnauthorized: false,
  };
}

function resolveConnectionConfig() {
  const base = {
    user: getRequiredEnv("MYSQL_USER"),
    password: process.env.MYSQL_PASSWORD || "",
    database: getRequiredEnv("MYSQL_DATABASE"),
    ssl: resolveSslConfig(),
    charset: "utf8mb4",
  };

  if (process.env.MYSQL_SOCKET_PATH) {
    return {
      ...base,
      socketPath: process.env.MYSQL_SOCKET_PATH,
    };
  }

  const rawHost = getRequiredEnv("MYSQL_HOST");
  const host = rawHost === "localhost" ? "127.0.0.1" : rawHost;
  return {
    ...base,
    host,
    port: toNumber(process.env.MYSQL_PORT, 3306),
  };
}

export function createMysqlKnex(): Knex {
  return knex({
    client: "mysql2",
    connection: resolveConnectionConfig(),
    pool: {
      min: 0,
      max: 10,
    },
  });
}

export const db = createMysqlKnex();

export async function pingDatabase(): Promise<void> {
  await db.raw("SELECT 1");
}

export function isMysqlDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeError = error as { code?: string; errno?: number };
  return maybeError.code === "ER_DUP_ENTRY" || maybeError.errno === 1062;
}

export function toNumeric(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
