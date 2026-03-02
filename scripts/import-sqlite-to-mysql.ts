import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import initSqlJs from "sql.js";
import { db, toNumeric } from "../db/mysql.ts";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ override: false });

const TABLE_ORDER = ["users", "contacts", "projects", "employees", "calls", "time_entries", "leads"] as const;

type TableName = (typeof TABLE_ORDER)[number];

type SqlJsValue = null | string | number | Uint8Array;
type SqlJsRow = Record<string, SqlJsValue>;
const require = createRequire(import.meta.url);

async function assertTargetTablesReady(): Promise<void> {
  for (const table of TABLE_ORDER) {
    const exists = await db.schema.hasTable(table);
    if (!exists) {
      throw new Error(`Missing table "${table}". Run migrations first with: npm run migrate:latest`);
    }
  }
}

async function assertTargetTablesEmpty(): Promise<void> {
  for (const table of TABLE_ORDER) {
    const row = await db(table).count<{ count: unknown }>({ count: "*" }).first();
    const count = toNumeric(row?.count);
    if (count > 0) {
      throw new Error(`Target MySQL table "${table}" is not empty (${count} rows). Aborting import.`);
    }
  }
}

async function setAutoIncrement(table: TableName): Promise<void> {
  const row = await db(table).max<{ maxId: unknown }>({ maxId: "id" }).first();
  const nextId = toNumeric(row?.maxId) + 1;
  const safeNextId = nextId > 1 ? nextId : 1;
  await db.raw("ALTER TABLE ?? AUTO_INCREMENT = ?", [table, safeNextId]);
}

function selectAll(sqliteDb: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>, table: TableName): SqlJsRow[] {
  const statement = sqliteDb.prepare(`SELECT * FROM ${table}`);
  const rows: SqlJsRow[] = [];
  try {
    while (statement.step()) {
      rows.push(statement.getAsObject() as SqlJsRow);
    }
  } finally {
    statement.free();
  }
  return rows;
}

async function main(): Promise<void> {
  const sqliteSourcePath = path.resolve(process.cwd(), process.env.SQLITE_SOURCE_PATH || "./crm.db");
  const sqliteBytes = fs.readFileSync(sqliteSourcePath);
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });
  const sqlite = new SQL.Database(sqliteBytes);

  console.log(`Using SQLite source: ${sqliteSourcePath}`);
  await assertTargetTablesReady();
  await assertTargetTablesEmpty();

  const summary: Record<string, number> = {};

  try {
    await db.transaction(async (trx) => {
      for (const table of TABLE_ORDER) {
        const rows = selectAll(sqlite, table) as Record<string, unknown>[];
        if (rows.length > 0) {
          const CHUNK_SIZE = 500;
          for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            await trx(table).insert(chunk);
          }
        }
        summary[table] = rows.length;
      }
    });

    for (const table of TABLE_ORDER) {
      await setAutoIncrement(table);
    }

    console.log("SQLite -> MySQL import complete.");
    for (const table of TABLE_ORDER) {
      console.log(`- ${table}: ${summary[table] || 0} rows`);
    }
  } finally {
    sqlite.close();
    await db.destroy();
  }
}

main().catch(async (error) => {
  console.error("Import failed:", error);
  await db.destroy();
  process.exit(1);
});
