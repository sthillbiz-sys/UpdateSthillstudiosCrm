/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("calls", (table) => {
    table.string("twilio_call_sid", 64).nullable();
    table.string("twilio_parent_call_sid", 64).nullable();
    table.string("from_number", 64).nullable();
    table.string("to_number", 64).nullable();
    table.integer("created_by_user_id").nullable();
    table.timestamp("started_at", { useTz: false }).nullable();
    table.timestamp("answered_at", { useTz: false }).nullable();
    table.timestamp("ended_at", { useTz: false }).nullable();
    table.string("error_code", 32).nullable();
    table.string("error_message", 255).nullable();
  });

  await knex.schema.alterTable("calls", (table) => {
    table.unique(["twilio_call_sid"], "calls_twilio_call_sid_unique");
    table.index(["twilio_parent_call_sid"], "calls_twilio_parent_call_sid_index");
    table.index(["created_by_user_id"], "calls_created_by_user_id_index");
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable("calls", (table) => {
    table.dropIndex(["created_by_user_id"], "calls_created_by_user_id_index");
    table.dropIndex(["twilio_parent_call_sid"], "calls_twilio_parent_call_sid_index");
    table.dropUnique(["twilio_call_sid"], "calls_twilio_call_sid_unique");
  });

  await knex.schema.alterTable("calls", (table) => {
    table.dropColumn("error_message");
    table.dropColumn("error_code");
    table.dropColumn("ended_at");
    table.dropColumn("answered_at");
    table.dropColumn("started_at");
    table.dropColumn("created_by_user_id");
    table.dropColumn("to_number");
    table.dropColumn("from_number");
    table.dropColumn("twilio_parent_call_sid");
    table.dropColumn("twilio_call_sid");
  });
};
