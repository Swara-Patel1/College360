import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { TABLES } from './relationships.js';

// Source: existing Supabase project (read-only, via the public anon key)
const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://olaqwoxycxdbcmqegifi.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sYXF3b3h5Y3hkYmNtcWVnaWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDYyODgsImV4cCI6MjA5ODM4MjI4OH0.JUYUKKGAAd7fx8s840meU0Ayd5VE7sfSMwDbiG8twlU';

// Target: local MongoDB
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME   = process.env.DB_NAME || 'college360';

async function fetchTable(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=100000`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body.slice(0, 120)}`);
  }
  return res.json();
}

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`✓ Connected to MongoDB → ${MONGO_URL}/${DB_NAME}\n`);

  let totalRows = 0;
  const summary = [];

  for (const table of TABLES) {
    try {
      const rows = await fetchTable(table);
      await db.collection(table).deleteMany({});          // idempotent re-run
      if (rows.length) await db.collection(table).insertMany(rows);
      totalRows += rows.length;
      summary.push({ table, rows: rows.length, status: 'ok' });
      console.log(`  ✓ ${table.padEnd(22)} ${rows.length} rows`);
    } catch (e) {
      summary.push({ table, rows: 0, status: 'SKIP: ' + e.message });
      console.log(`  ⚠ ${table.padEnd(22)} skipped (${e.message})`);
    }
  }

  console.log(`\n✓ Migration complete — ${totalRows} rows across ${summary.filter(s => s.status === 'ok').length} collections.`);
  await client.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
