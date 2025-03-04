const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING,
});

async function runSQL() {
  try {
    const sql = fs.readFileSync('create_tables.sql', 'utf8');
    await pool.query(sql);
    console.log("✅ Tables created successfully.");
  } catch (err) {
    console.error("❌ Error executing SQL:", err);
  } finally {
    pool.end();
  }
}

runSQL();
