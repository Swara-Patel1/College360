# Notes for AI agents / assistants running this project

**Read `SETUP.md` for full instructions.** Key facts so you don't go looking for a
missing database or cloud backend:

1. **The database is bundled in this repo — do NOT look for Supabase/cloud.**
   A MongoDB snapshot (25 collections, ~1138 docs) is committed at
   `backend-node/db-export/*.json` (also zipped at `college360-database.zip`).
   Load it into a running local MongoDB with:
   ```
   cd backend-node && npm install && npm run import-db
   ```

2. **Three services to run** (see SETUP.md for details):
   - `backend-node/`  → `npm start`  → Data API on **:4000** (Node + MongoDB)
   - `backend/`       → `python manage.py migrate` then `python manage.py runserver 8000` → Django AI chatbot on **:8000**
   - `edumanage_frontend/` → `npm install && npm run dev` → UI on **:5173**

3. **Prerequisites:** Node 18+, MongoDB Community Server (running on :27017), Python 3.10+ (for the chatbot only).

4. **Secrets are gitignored.** Create `backend/.env` from `backend/.env.example` and add a
   free Groq API key (https://console.groq.com/keys) for the chatbot. The Data API
   needs no secrets (defaults to local MongoDB).

5. **Do not "reconnect to Supabase."** The project was migrated off Supabase to MongoDB.
   The frontend's `client.js` `SUPABASE_URL` intentionally points to `http://localhost:4000`.
