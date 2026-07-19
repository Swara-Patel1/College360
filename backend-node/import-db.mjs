// Imports the JSON files in ./db-export/ into MongoDB (replaces existing data).
// Usage:  node import-db.mjs
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME   = process.env.DB_NAME || 'college360';
const IN_DIR    = join(__dirname, 'db-export');

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`✓ Target: ${MONGO_URL}/${DB_NAME}\n`);

  const files = readdirSync(IN_DIR).filter(f => f.endsWith('.json') && f !== '_manifest.json');
  let total = 0;

  for (const file of files) {
    const name = file.replace(/\.json$/, '');
    const docs = JSON.parse(readFileSync(join(IN_DIR, file), 'utf8'));
    await db.collection(name).deleteMany({});        // idempotent re-run
    if (docs.length) await db.collection(name).insertMany(docs);
    total += docs.length;
    console.log(`  ✓ ${name.padEnd(22)} ${docs.length} docs`);
  }

  console.log(`\n✓ Imported ${total} docs across ${files.length} collections.`);
  await client.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
