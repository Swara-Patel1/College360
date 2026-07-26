# Notes for AI agents / assistants running this project

1. **Architecture — Django DRF Backend + React Frontend:**
   The project has been consolidated onto **Django (port 8000)** using PostgreSQL (or SQLite via DB_ENGINE) + DRF as the single backend serving both data and AI chatbot features.
   - `backend/` → `python manage.py runserver 8000` (Django DRF + PostgreSQL + Chatbot)
   - `edumanage_frontend/` → `npm run dev` (React UI on port **:5173**)

2. **Database & Seeding:**
   Database JSON exports are stored at `backend/db-export/*.json`.
   PostgreSQL connection settings are specified in `backend/.env` (`DB_ENGINE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`).
   To migrate and re-seed the database at any time:
   ```bash
   cd backend
   python manage.py migrate
   python seed_data.py
   ```


3. **Course Utilities:**
   Frontend course curriculum utilities (Multer upload, Nodemailer fee reminder, MongoDB indexing) are preserved at `edumanage_frontend/src/course_utilities/`.
