const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env.local"), override: false });
dotenv.config({ override: false });

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  return { rejectUnauthorized: false };
}

function buildConnection() {
  const base = {
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: resolveSslConfig(),
    charset: "utf8mb4",
  };

  if (process.env.MYSQL_SOCKET_PATH) {
    return {
      ...base,
      socketPath: process.env.MYSQL_SOCKET_PATH,
    };
  }

  const rawHost = process.env.MYSQL_HOST;
  const host = rawHost === "localhost" ? "127.0.0.1" : rawHost;
  return {
    ...base,
    host,
    port: toNumber(process.env.MYSQL_PORT, 3306),
  };
}

function mysqlConfig() {
  return {
    client: "mysql2",
    connection: buildConnection(),
    pool: {
      min: 0,
      max: 10,
    },
    migrations: {
      directory: path.resolve(__dirname, "db/migrations"),
      extension: "cjs",
      tableName: "knex_migrations",
    },
  };
}

module.exports = {
  development: mysqlConfig(),
  production: mysqlConfig(),
};
