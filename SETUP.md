# College360 — Setup Guide (fresh machine)

> **The app runs on a single Django backend (PostgreSQL + DRF) and a React
> frontend.** There is no MongoDB, Node data API, or separate real-time server
> anymore — those legacy pieces have been removed.

This project has **two runnable parts**:

| Part | Folder | Port | Tech | Purpose |
|------|--------|------|------|---------|
| Backend | `backend/` | 8000 | Python · Django · DRF · **PostgreSQL** | All data + AI chatbot |
| Frontend | `edumanage_frontend/` | 5173 | React + Vite | The web app UI |

The React client talks to Django on **:8000** — both the DRF endpoints under
`/api/…` and a PostgREST-compatible shim at `/rest/v1/<table>`
(`backend/rest_compat.py`) used by the frontend's `SupaFetch` client.

---

## Prerequisites

1. **Python** 3.10+ — https://www.python.org
2. **Node.js** v18+ — https://nodejs.org
3. **PostgreSQL** 14+ — https://www.postgresql.org/download/
   - Create a database named **`College360`**.

---

## Step 1 — Database

Create the database (via pgAdmin, or on the command line):

```sql
CREATE DATABASE "College360";
```

If you have a SQL dump, load it:

```bash
psql -U postgres -d College360 -f your_dump.sql
```

---

## Step 2 — Backend (Django + PostgreSQL)

```bash
cd backend
pip install -r requirements.txt

# Configure the database + keys
copy .env.example .env        # Windows   (cp .env.example .env on mac/linux)
```

Edit **`backend/.env`** to point at your PostgreSQL instance:

```ini
DB_ENGINE=django.db.backends.postgresql
DB_NAME=College360
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432                  # use your server's port (e.g. 5433 for a second instance)

# AI chatbot (free key: https://console.groq.com/keys)
GROQ_API_KEY=gsk_...
```

> To use SQLite instead of PostgreSQL, set `DB_ENGINE=django.db.backends.sqlite3`
> and `DB_NAME=db.sqlite3`.

Apply migrations and start the server:

```bash
python manage.py migrate
python manage.py runserver 8000      # -> http://localhost:8000   (leave running)
```

Optionally, train the placement-prediction ML model:

```bash
python manage.py train_placement_model --all
```

---

## Step 3 — Frontend (React)

```bash
cd ../edumanage_frontend
npm install
npm run dev          # -> http://localhost:5173
```

Open the printed URL. The app opens on the **landing page**; click **Sign In**.

---

## Login credentials (demo accounts)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@lju.edu.in` | `admin123` |
| Faculty | `faculty1@lju.edu.in` | `fac123` |
| HOD | `hod@lju.edu.in` | `hod123` |
| Student | `rushi@lju.edu.in` | `rushi123` |

---

## Windows one-click

`start.bat` in the repo root launches the Django backend and the React frontend
together, then opens the browser.

---

## Tests

```bash
cd backend
python -m pytest          # unit + API integration tests (server must be running for API tests)
```

---

## Notes / troubleshooting
- **`.env` is not committed** (gitignored). Create `backend/.env` from
  `backend/.env.example`.
- **Two PostgreSQL instances?** Make sure `DB_PORT` matches the one holding
  `College360` (a default install is `5432`; a second one is often `5433`).
- **Chatbot not answering?** Set a valid `GROQ_API_KEY` in `backend/.env`.
- Real-time push (Socket.io) has been removed; the UI refreshes on load and
  after actions instead.
