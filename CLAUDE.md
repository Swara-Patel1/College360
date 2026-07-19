# CLAUDE.md

See **`AGENTS.md`** and **`SETUP.md`** in this repo root for how to run the project.

TL;DR: the database ships with the repo — run `cd backend-node && npm install && npm run import-db`
to load the bundled MongoDB snapshot (`backend-node/db-export/`) into a local MongoDB.
Then start the Data API (`backend-node`, :4000), the Django chatbot (`backend`, :8000),
and the frontend (`edumanage_frontend`, :5173). The project uses **MongoDB, not Supabase**.
