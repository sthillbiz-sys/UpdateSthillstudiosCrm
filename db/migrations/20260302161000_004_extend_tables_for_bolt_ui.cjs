/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('contacts', (table) => {
    table.string('first_name', 128).nullable();
    table.string('last_name', 128).nullable();
    table.integer('company_id').nullable();
    table.string('position', 128).nullable();
    table.text('notes').nullable();
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.index(['company_id'], 'contacts_company_id_index');
  });

  await knex.schema.alterTable('contacts', (table) => {
    table
      .foreign('company_id', 'contacts_company_id_fk')
      .references('companies.id')
      .onDelete('SET NULL');
  });

  await knex.schema.alterTable('employees', (table) => {
    table.decimal('hourly_rate', 10, 2).nullable();
    table.date('hire_date').nullable();
    table.string('status', 32).notNullable().defaultTo('active');
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('leads', (table) => {
    table.integer('created_by_user_id').nullable();
    table.index(['created_by_user_id'], 'leads_created_by_user_id_index');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('leads', (table) => {
    table.dropIndex(['created_by_user_id'], 'leads_created_by_user_id_index');
    table.dropColumn('created_by_user_id');
  });

  await knex.schema.alterTable('employees', (table) => {
    table.dropColumn('updated_at');
    table.dropColumn('status');
    table.dropColumn('hire_date');
    table.dropColumn('hourly_rate');
  });

  await knex.schema.alterTable('contacts', (table) => {
    table.dropForeign(['company_id'], 'contacts_company_id_fk');
  });

  await knex.schema.alterTable('contacts', (table) => {
    table.dropIndex(['company_id'], 'contacts_company_id_index');
    table.dropColumn('updated_at');
    table.dropColumn('created_at');
    table.dropColumn('notes');
    table.dropColumn('position');
    table.dropColumn('company_id');
    table.dropColumn('last_name');
    table.dropColumn('first_name');
  });
};
