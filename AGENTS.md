# Notes for AI agents / assistants running this project

1. **Architecture — Django DRF Backend + React Frontend:**
   The project has been consolidated onto **Django (port 8000)** using SQLite + DRF as the single backend serving both data and AI chatbot features.
   - `backend/` → `python manage.py runserver 8000` (Django DRF + SQLite + Chatbot)
   - `edumanage_frontend/` → `npm run dev` (React UI on port **:5173**)

2. **Database & Seeding:**
   Database JSON exports are stored at `backend/db-export/*.json`.
   To re-seed the SQLite database at any time:
   ```bash
   cd backend && python seed_data.py
   ```

3. **Course Utilities:**
   Frontend course curriculum utilities (Multer upload, Nodemailer fee reminder, MongoDB indexing) are preserved at `edumanage_frontend/src/course_utilities/`.
