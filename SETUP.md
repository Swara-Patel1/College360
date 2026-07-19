# College360 — Setup Guide (fresh machine)

> **📀 The database is INCLUDED in this repo.** You do **not** need Supabase or any
> cloud account. A full snapshot of the MongoDB data (25 collections, ~1138
> documents) lives in **`backend-node/db-export/`** as JSON, and there's also a
> copy zipped at **`college360-database.zip`**. Step 2 below loads it into MongoDB
> with one command.

This project has **three runnable parts**:

| Part | Folder | Port | Tech | Purpose |
|------|--------|------|------|---------|
| Data API | `backend-node/` | 4000 | Node + Express + **MongoDB** | Main data API (students, faculty, fees, …) |
| Chatbot API | `backend/` | 8000 | Python + **Django** | AI student assistant (uses Groq) |
| Frontend | `edumanage_frontend/` | 5173 | React + Vite | The web app UI |

---

## Prerequisites (install these first)

1. **Node.js** v18+ — https://nodejs.org
2. **MongoDB Community Server** — https://www.mongodb.com/try/download/community
   - On Windows it installs as a service named **MongoDB** and starts automatically.
   - Verify it's running (default port 27017).
3. **Python** 3.10+ — https://www.python.org  (only needed for the AI chatbot)

---

## Step 1 — Data API (MongoDB)

```bash
cd backend-node
npm install
```

## Step 2 — Load the included database  ⬅️ THE DATABASE IS HERE

```bash
# still in backend-node/  — imports backend-node/db-export/*.json into MongoDB
npm run import-db
```
You should see `✓ Imported 1138 docs across 25 collections.`
*(If you only have the standalone `college360-database.zip`, unzip it and run
`npm install && node import-db.mjs` inside it instead.)*

Now start the Data API:
```bash
npm start          # -> http://localhost:4000   (leave running)
```

## Step 3 — Chatbot API (Django) — optional, only for the AI assistant

```bash
cd ../backend
pip install django djangorestframework django-cors-headers groq python-dotenv djangorestframework-simplejwt
python manage.py migrate            # creates the local chat-history SQLite DB
copy .env.example .env              # (Windows)   /   cp .env.example .env  (mac/linux)
#   then edit backend/.env and set GROQ_API_KEY=gsk_...   (free key: https://console.groq.com/keys)
python manage.py runserver 8000     # -> http://localhost:8000   (leave running)
```

## Step 4 — Frontend

```bash
cd ../edumanage_frontend
npm install
npm run dev          # -> http://localhost:5173
```

Open the printed URL in a browser.

---

## Login credentials (they come with the imported data)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@lju.edu.in` | `admin123` |
| Student | `student.ce1@edumanagepro.edu` | (see users data) |

The admin can manage students, faculty, HODs, courses, departments, and fees.

---

## How it fits together
- The frontend talks to the **Data API on :4000** (configured in
  `edumanage_frontend/src/api/client.js` — `SUPABASE_URL` points to `http://localhost:4000`).
- The Data API speaks a PostgREST-compatible dialect over MongoDB, so the frontend
  needed no rewrite when the project moved off Supabase.
- The chatbot (student panel) calls the **Django API on :8000**, which uses Groq for AI.

## Notes / troubleshooting
- **`.env` files are NOT in the repo** (gitignored). Create `backend/.env` from
  `backend/.env.example` and add your own Groq key. The Data API works without any
  `.env` (defaults to local MongoDB).
- **No data after Step 2?** Make sure MongoDB is actually running before importing.
- **To use a cloud DB (MongoDB Atlas) instead of local:** set `MONGO_URL` in
  `backend-node/.env` to your Atlas connection string, then run `npm run import-db`.
- Windows users can start everything at once with **`start.bat`** in the repo root
  (it assumes the DB is already imported via Step 2).
