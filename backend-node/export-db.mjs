// Exports every collection from MongoDB to JSON files in ./db-export/
// Usage:  node export-db.mjs
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME   = process.env.DB_NAME || 'college360';
const OUT_DIR   = join(__dirname, 'db-export');

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`✓ Source: ${MONGO_URL}/${DB_NAME}\n`);

  const collections = await db.listCollections().toArray();
  const manifest = [];
  let total = 0;

  for (const { name } of collections) {
    const docs = await db.collection(name).find({}).toArray();
    docs.forEach(d => delete d._id);                 // fresh _id on import
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(docs));
    manifest.push({ collection: name, count: docs.length });
    total += docs.length;
    console.log(`  ✓ ${name.padEnd(22)} ${docs.length} docs`);
  }

  writeFileSync(join(OUT_DIR, '_manifest.json'), JSON.stringify({ db: DB_NAME, exported_at: new Date().toISOString(), collections: manifest }, null, 2));
  console.log(`\n✓ Exported ${total} docs across ${collections.length} collections → db-export/`);
  await client.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
