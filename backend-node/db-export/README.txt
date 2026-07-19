College360 — Database Snapshot
==============================

This folder is a full copy of the College360 MongoDB database
(25 collections, ~1138 documents) exported as JSON.

WHAT YOUR FRIEND NEEDS FIRST
----------------------------
1. Node.js  (v18+)         -> https://nodejs.org
2. MongoDB Community Server -> https://www.mongodb.com/try/download/community
   (installed and RUNNING — on Windows it runs as the "MongoDB" service)

HOW TO LOAD THIS DATA (two options)
-----------------------------------
Option A — you also have the full project repo (recommended):
  1. Put this whole `db-export` folder inside the project's `backend-node/` folder
     (so the path is  backend-node/db-export/ ).
  2. Open a terminal in `backend-node/`:
        npm install
        node import-db.mjs
  3. Start the project as usual (backend-node `npm start`, then the frontend).

Option B — you only have THIS zip (no repo yet):
  1. Unzip it. In the unzipped folder:
        npm install
        node import-db.mjs
     This loads the data into your local MongoDB (database name: college360).
  2. Then get the project code, and run it — it will use this data.

NOTES
-----
- import-db.mjs REPLACES any existing college360 data (safe to re-run).
- Default connection is mongodb://127.0.0.1:27017 . To target a different
  MongoDB, set MONGO_URL before running, e.g. (PowerShell):
        $env:MONGO_URL="mongodb://SOME_HOST:27017"; node import-db.mjs
- No passwords/keys are included in this snapshot. Login accounts and their
  (demo) passwords are part of the data itself (e.g. admin@lju.edu.in / admin123).
