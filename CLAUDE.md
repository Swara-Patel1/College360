# CLAUDE.md

See **`AGENTS.md`** and **`SETUP.md`** in this repo root for how to run the project.

## Architecture (current)

The project runs on a **single Django backend (port 8000)** using **SQLite (`backend/db.sqlite3`)**
+ Django REST Framework, serving both data and the AI chatbot. The React frontend
(`edumanage_frontend`, port :5173) talks to it.

- `backend/` → `python manage.py runserver 8000` (Django DRF + SQLite + Chatbot)
- `edumanage_frontend/` → `npm run dev` (React UI on :5173)

## Database & seeding

The database ships with the repo (`backend/db.sqlite3`, already populated). The original
data lives as JSON exports in `backend/db-export/*.json`. To (re)load it into SQLite:

```bash
cd backend && python seed_data.py
```

> **Legacy:** `backend-node/` (MongoDB Data API) and the MongoDB snapshot are **no longer used** —
> the app was consolidated onto Django + SQLite. The seed script imports the old MongoDB
> JSON exports into the Django ORM.

The React client reaches Django through two layers:
- `POST /api/auth/login/` and other DRF endpoints under `/api/…`
- a PostgREST-compatible shim at `/rest/v1/<table>` (`backend/rest_compat.py`) used by the
  frontend's `SupaFetch` client in `edumanage_frontend/src/api/client.js`.
