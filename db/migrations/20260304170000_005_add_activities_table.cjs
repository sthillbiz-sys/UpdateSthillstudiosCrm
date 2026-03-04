/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasActivities = await knex.schema.hasTable('activities');
  if (hasActivities) {
    return;
  }

  await knex.schema.createTable('activities', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.string('related_to_type', 64).notNullable().defaultTo('contact');
    table.string('related_to_id', 64).nullable();
    table.string('type', 32).notNullable().defaultTo('task');
    table.string('title', 255).notNullable();
    table.text('description').nullable();
    table.dateTime('due_date').nullable();
    table.boolean('completed').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.index(['user_id'], 'activities_user_id_idx');
    table.index(['due_date'], 'activities_due_date_idx');
    table.index(['completed'], 'activities_completed_idx');
    table.index(['user_id', 'completed'], 'activities_user_completed_idx');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('activities');
};
