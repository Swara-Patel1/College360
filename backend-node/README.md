# College360 Backend (MongoDB)

Replaces Supabase with a local **MongoDB + Express** API that speaks the same
PostgREST dialect the frontend already used — so the React app works unchanged
apart from one line (`SUPABASE_URL`) in `edumanage_frontend/src/api/client.js`.

## Stack
- **MongoDB** (local, `mongodb://127.0.0.1:27017`, database `college360`)
- **Node + Express** (`server.js`) exposing `/rest/v1/:table`
- **`rest.js`** — PostgREST-compatible query engine: `select` with nested/aliased
  embeds, filters (`eq`/`neq`/`in`), `order`, `limit`, and POST/PATCH/DELETE with
  `return=representation`.
- **`relationships.js`** — primary keys, embed foreign-key registry, insert defaults.

## Run
```bash
# 1. MongoDB must be running (installed as a Windows service "MongoDB")
# 2. Install deps (first time only)
cd backend-node
npm install

# 3. (First time / to refresh) migrate data from Supabase -> MongoDB
npm run migrate

# 4. Start the API
npm start          # http://localhost:4000
```

## Config (env vars, all optional)
| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `4000` | API port |
| `MONGO_URL` | `mongodb://127.0.0.1:27017` | Mongo connection |
| `DB_NAME` | `college360` | Database name |
| `SUPABASE_URL` / `SUPABASE_ANON` | project defaults | migration source only |

## Re-running the migration
`npm run migrate` is idempotent — it clears each collection and re-pulls from
Supabase. Safe to run repeatedly while Supabase still exists as the source of truth.

## Running as a Windows service (auto-start on boot)

The API is installed as the Windows service **`College360 API`** (service id
`college360api.exe`), set to start automatically — so it's always up, like MongoDB.

```powershell
# Control it (query works unelevated; start/stop need an elevated shell)
Get-Service college360api.exe
net stop  "college360api.exe"
net start "college360api.exe"
```

Install / uninstall the service (run from an **Administrator** shell):
```bash
node install-service.cjs     # install + start (auto-start on boot)
node uninstall-service.cjs   # remove the service
```

Logs while running as a service are written to `daemon/` in this folder.
If you prefer to run it by hand instead, uninstall the service first (otherwise
port 4000 is already taken), then `npm start`.

## Switching the frontend back to Supabase
In `edumanage_frontend/src/api/client.js`, restore the original `SUPABASE_URL`
and `SUPABASE_ANON` values (kept in the comment there).
