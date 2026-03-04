/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('user_presence');
  if (hasTable) {
    return;
  }

  await knex.schema.createTable('user_presence', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.string('email', 191).notNullable();
    table.string('name', 191).notNullable();
    table.string('role', 64).notNullable().defaultTo('agent');
    table.string('status', 32).notNullable().defaultTo('available');
    table.text('custom_message').nullable();
    table.boolean('is_on_call').notNullable().defaultTo(false);
    table.timestamp('last_seen', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('last_offline_at', { useTz: false }).nullable();
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.unique(['user_id'], 'user_presence_user_id_unique');
    table.index(['email'], 'user_presence_email_idx');
    table.index(['status'], 'user_presence_status_idx');
    table.index(['last_seen'], 'user_presence_last_seen_idx');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_presence');
};
