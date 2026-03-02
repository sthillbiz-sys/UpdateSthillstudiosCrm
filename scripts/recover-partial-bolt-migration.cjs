/* eslint-disable no-console */
const knexFactory = require("knex");
const knexConfig = require("../knexfile.cjs");

const TARGET_MIGRATION = "20260302160000_003_add_bolt_core_tables.cjs";
const CORE_TABLES = ["shift_entries", "meetings", "calendar_notes", "deals", "companies"];

function resolveEnvironment() {
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

async function migrationAlreadyApplied(knex) {
  const hasMigrationsTable = await knex.schema.hasTable("knex_migrations");
  if (!hasMigrationsTable) {
    return false;
  }

  const row = await knex("knex_migrations")
    .where({ name: TARGET_MIGRATION })
    .first("id");
  return Boolean(row);
}

async function hasAnyCoreTable(knex) {
  for (const tableName of CORE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasTable(tableName)) {
      return true;
    }
  }
  return false;
}

async function dropCoreTables(knex) {
  for (const tableName of CORE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.dropTableIfExists(tableName);
  }
}

async function main() {
  const environment = resolveEnvironment();
  const config = knexConfig[environment];
  const knex = knexFactory(config);

  try {
    const alreadyApplied = await migrationAlreadyApplied(knex);
    if (alreadyApplied) {
      console.log(`[deploy] recovery skip: migration ${TARGET_MIGRATION} is already applied`);
      return;
    }

    const coreTablesExist = await hasAnyCoreTable(knex);
    if (!coreTablesExist) {
      console.log("[deploy] recovery skip: no partial core tables detected");
      return;
    }

    console.log(
      `[deploy] recovery: dropping partial core tables before retrying ${TARGET_MIGRATION}`
    );
    await dropCoreTables(knex);
    console.log("[deploy] recovery: partial core tables removed");
  } finally {
    await knex.destroy();
  }
}

main().catch((error) => {
  console.error("[deploy] recovery failed:", error.message);
  process.exit(1);
});
