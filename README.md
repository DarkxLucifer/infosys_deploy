# InfraScan — Civil Infrastructure Inspection & Damage Assessment

InfraScan is an enterprise full-stack platform for AI-assisted civil infrastructure inspection, automated crack and surface damage detection, geometric defect quantification, and maintenance prioritization.

---

## 🏗️ Architecture & Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2, Pydantic v2, OpenCV, Pillow, PyJWT, Argon2id.
- **Frontend**: Vite 8, React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Sonner.
- **Database**: PostgreSQL 16 (PostGIS) with SQLite local dev mode (`infrascan_dev.db`).
- **Storage**: MinIO / Local file storage fallback for original, processed, and thumbnail imagery.
- **Testing**: Pytest (19 comprehensive regression tests) + Playwright (responsive headless browser tests).

---

## 🚀 Getting Started

### 1. Environment Setup

Ensure Python 3.12 and Node.js are available. Use the workspace virtual environment:
```powershell
# Set up environment variables
Copy-Item .env.example .env
```

### 2. Initialize Database & Seed Reference Data

```powershell
# Seed reference categories (8 cracks, 9 surface damage, 5 severities, 5 priorities, 8 infra types, 5 alert levels)
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m app.cli seed

# Import baseline benchmark dataset EDA metrics
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m app.cli import-eda

# Create the first administrator
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m app.cli create-admin --email admin@authority.gov --name "Lead Administrator"
```

### 3. Run the Services

```powershell
# Terminal 1: Backend API Gateway (Port 8000)
cd apps/api
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Frontend Web Application (Port 5173)
cd frontend
npm run dev
```

---

## 🧪 Running Automated Tests

Run the complete regression suite with one command:
```powershell
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m pytest apps/api/tests/ -v
```

Run frontend typecheck and linter:
```powershell
cd frontend
npm run build
npm run lint
```

---

## 🔑 How to Verify Google Sign-In Yourself

Live Google OAuth requires registering your own Google Cloud OAuth 2.0 Client credentials:

1. **Open Google Cloud Console**:
   Navigate to [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials).

2. **Configure OAuth Consent Screen**:
   - Set User Type to **External**.
   - Under **Test users**, add your Google account email (e.g. `your.email@gmail.com`). *Important: While publishing status is "Testing", only listed test users are permitted to authenticate.*

3. **Configure OAuth 2.0 Client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173`
   - **Authorized redirect URIs**: `http://localhost:5173/oauth/callback`

4. **Update `.env`**:
   Add your Client ID and Client Secret:
   ```ini
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
   ```

5. **Test the Flow**:
   - Open `http://localhost:5173/login`. The **Continue with Google** button will be automatically displayed.
   - Click **Continue with Google**, authenticate with your Google test user account.
   - You will be redirected back to `http://localhost:5173/oauth/callback`.
   - **New User Flow (No Direct Login)**: Unknown emails create a `pending_approval` user account and show the "Waiting for administrator approval" screen.
   - **Admin Approval**: Log in as administrator, navigate to `/app/admin`, and approve the pending user account.
   - On next Google sign-in, the user lands directly on their approved role dashboard.

---

## 📑 Documentation

- `docs/audit-report.md`: Complete audit matrix of all Week 1 checks (Sections A to R).
- `docs/traceability.md`: Requirements traceability matrix covering all 22 PDF modules.
