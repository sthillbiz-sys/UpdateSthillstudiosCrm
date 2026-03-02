/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("contacts", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.increments("id").primary();
    table.string("name", 191).notNullable();
    table.string("company", 191).nullable();
    table.string("email", 191).nullable();
    table.string("phone", 64).nullable();
    table.string("assigned_to", 191).nullable();
    table.string("status", 64).notNullable().defaultTo("active");
  });

  await knex.schema.createTable("projects", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.increments("id").primary();
    table.string("name", 191).notNullable();
    table.text("description").nullable();
    table.string("status", 64).notNullable().defaultTo("active");
  });

  await knex.schema.createTable("calls", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.increments("id").primary();
    table.string("contact_name", 191).nullable();
    table.string("phone_number", 64).nullable();
    table.integer("duration").nullable();
    table.string("status", 64).nullable();
    table.timestamp("timestamp", { useTz: false }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("time_entries", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.increments("id").primary();
    table.string("employee_name", 191).nullable();
    table.string("date", 32).nullable();
    table.decimal("hours", 8, 2).nullable();
    table.text("description").nullable();
    table.string("status", 64).notNullable().defaultTo("approved");
  });

  await knex.schema.createTable("employees", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.increments("id").primary();
    table.string("name", 191).notNullable();
    table.string("email", 191).nullable();
    table.string("role", 128).nullable();
    table.text("contact_info").nullable();
  });

  await knex.schema.createTable("leads", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.increments("id").primary();
    table.string("name", 191).nullable();
    table.string("email", 191).nullable();
    table.string("phone", 64).nullable();
    table.string("source", 191).nullable();
    table.timestamp("timestamp", { useTz: false }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("users", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.increments("id").primary();
    table.string("name", 191).notNullable();
    table.string("email", 191).notNullable().unique();
    table.string("password", 255).notNullable();
    table.string("role", 64).notNullable().defaultTo("agent");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("leads");
  await knex.schema.dropTableIfExists("employees");
  await knex.schema.dropTableIfExists("time_entries");
  await knex.schema.dropTableIfExists("calls");
  await knex.schema.dropTableIfExists("projects");
  await knex.schema.dropTableIfExists("contacts");
};
