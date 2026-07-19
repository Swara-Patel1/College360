// Copies every collection from the LOCAL MongoDB to a remote MongoDB (Atlas).
// Usage:
//   node copy-to-atlas.mjs "<ATLAS_CONNECTION_STRING>"
// or set DEST_URL in the environment. The local source defaults to localhost.
import { MongoClient } from 'mongodb';

const SRC_URL  = process.env.SRC_URL  || 'mongodb://127.0.0.1:27017';
const DEST_URL = process.argv[2] || process.env.DEST_URL;
const DB_NAME  = process.env.DB_NAME || 'college360';

if (!DEST_URL) {
  console.error('✗ Provide the Atlas connection string:  node copy-to-atlas.mjs "mongodb+srv://…"');
  process.exit(1);
}

async function main() {
  const src = new MongoClient(SRC_URL);
  const dest = new MongoClient(DEST_URL);
  await src.connect();
  await dest.connect();
  const srcDb = src.db(DB_NAME);
  const destDb = dest.db(DB_NAME);
  console.log(`✓ Source : ${SRC_URL}/${DB_NAME}`);
  console.log(`✓ Target : Atlas/${DB_NAME}\n`);

  const collections = await srcDb.listCollections().toArray();
  let total = 0;
  for (const { name } of collections) {
    const docs = await srcDb.collection(name).find({}).toArray();
    await destDb.collection(name).deleteMany({});          // idempotent
    if (docs.length) await destDb.collection(name).insertMany(docs);
    total += docs.length;
    console.log(`  ✓ ${name.padEnd(22)} ${docs.length} docs`);
  }

  console.log(`\n✓ Copied ${total} docs across ${collections.length} collections to Atlas.`);
  await src.close();
  await dest.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
