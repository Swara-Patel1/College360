import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import { createRestRouter } from './rest.js';

const PORT      = process.env.PORT || 4000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME   = process.env.DB_NAME || 'college360';

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`✓ Connected to MongoDB → ${MONGO_URL}/${DB_NAME}`);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // Health check
  app.get('/', (_req, res) => res.json({ ok: true, service: 'college360-backend', db: DB_NAME }));

  // PostgREST-compatible data API (mounted where Supabase served it)
  app.use('/rest/v1', createRestRouter(db));

  app.listen(PORT, () => console.log(`✓ API listening on http://localhost:${PORT}`));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
