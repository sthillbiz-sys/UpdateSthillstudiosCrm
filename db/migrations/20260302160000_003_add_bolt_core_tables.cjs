/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('companies', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.string('name', 191).notNullable();
    table.string('website', 255).nullable();
    table.string('industry', 128).nullable();
    table.string('size', 64).nullable();
    table.string('phone', 64).nullable();
    table.string('address', 255).nullable();
    table.text('notes').nullable();
    table.integer('created_by_user_id').nullable();
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.index(['created_by_user_id'], 'companies_created_by_user_id_index');
  });

  await knex.schema.createTable('deals', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.string('title', 191).notNullable();
    table.decimal('value', 12, 2).notNullable().defaultTo(0);
    table.string('stage', 64).notNullable().defaultTo('lead');
    table.integer('probability').notNullable().defaultTo(0);
    table.date('expected_close_date').nullable();
    table.integer('contact_id').nullable();
    table.integer('company_id').nullable();
    table.text('notes').nullable();
    table.integer('created_by_user_id').nullable();
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.index(['stage'], 'deals_stage_index');
    table.index(['contact_id'], 'deals_contact_id_index');
    table.index(['company_id'], 'deals_company_id_index');
    table.index(['created_by_user_id'], 'deals_created_by_user_id_index');
    table
      .foreign('contact_id', 'deals_contact_id_fk')
      .references('contacts.id')
      .onDelete('SET NULL');
    table
      .foreign('company_id', 'deals_company_id_fk')
      .references('companies.id')
      .onDelete('SET NULL');
  });

  await knex.schema.createTable('calendar_notes', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.date('note_date').notNullable();
    table.text('note_text').notNullable();
    table.integer('contact_id').nullable();
    table.string('contact_name', 191).nullable();
    table.string('follow_up_type', 64).notNullable().defaultTo('reminder');
    table.string('priority', 32).notNullable().defaultTo('medium');
    table.boolean('completed').notNullable().defaultTo(false);
    table.integer('created_by_user_id').nullable();
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.index(['note_date'], 'calendar_notes_note_date_index');
    table.index(['contact_id'], 'calendar_notes_contact_id_index');
    table.index(['created_by_user_id'], 'calendar_notes_created_by_user_id_index');
    table
      .foreign('contact_id', 'calendar_notes_contact_id_fk')
      .references('contacts.id')
      .onDelete('SET NULL');
  });

  await knex.schema.createTable('meetings', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.string('title', 191).notNullable();
    table.string('meeting_type', 32).notNullable().defaultTo('video');
    table.date('scheduled_date').notNullable();
    table.time('scheduled_time').notNullable();
    table.string('duration', 64).notNullable().defaultTo('30 minutes');
    table.text('description').nullable();
    table.string('room_name', 191).notNullable();
    table.string('status', 32).notNullable().defaultTo('scheduled');
    table.text('attendees_json').nullable();
    table.integer('created_by_user_id').nullable();
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.index(['scheduled_date'], 'meetings_scheduled_date_index');
    table.index(['created_by_user_id'], 'meetings_created_by_user_id_index');
  });

  await knex.schema.createTable('shift_entries', (table) => {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.date('shift_date').notNullable();
    table.timestamp('clock_in', { useTz: false }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('clock_out', { useTz: false }).nullable();
    table.timestamp('lunch_start', { useTz: false }).nullable();
    table.timestamp('lunch_end', { useTz: false }).nullable();
    table.integer('lunch_duration_minutes').notNullable().defaultTo(0);
    table.decimal('total_hours', 6, 2).nullable();
    table.string('status', 32).notNullable().defaultTo('clocked_in');
    table.text('notes').nullable();
    table.timestamp('created_at', { useTz: false }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: false }).defaultTo(knex.fn.now());
    table.index(['user_id'], 'shift_entries_user_id_index');
    table.index(['shift_date'], 'shift_entries_shift_date_index');
    table.index(['status'], 'shift_entries_status_index');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('shift_entries');
  await knex.schema.dropTableIfExists('meetings');
  await knex.schema.dropTableIfExists('calendar_notes');
  await knex.schema.dropTableIfExists('deals');
  await knex.schema.dropTableIfExists('companies');
};
