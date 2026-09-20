# Vromon — Setup & Development Guide

## Verified Working Screenshots

### Day 1 — Beach & Nature itinerary with interactive map
![Day 1 itinerary with map](C:/Users/mdsul/.gemini/antigravity-ide/brain/cb2b0823-3218-4ec2-bd5c-c4ca456e5ffc/itinerary_day1_view_1789891909710.png)

### Day 2 — Nature & Food with updated map markers
![Day 2 itinerary with updated map](C:/Users/mdsul/.gemini/antigravity-ide/brain/cb2b0823-3218-4ec2-bd5c-c4ca456e5ffc/itinerary_day2_view_1789891994750.png)

---

## Changes Made (Bug Fixes + Features)

| File | Change |
|---|---|
| `frontend/src/components/Map/TripMap.tsx` | **Fixed blank page crash** — rewrote to vanilla Leaflet (react-leaflet v4 incompatible with React 19) |
| `backend/app/database/seeder.py` | Fixed UTF-8 encoding for JSON + emoji crash on Windows |
| `backend/app/config.py` | Migrated Pydantic v2 deprecated config |
| `backend/requirements.txt` | Relaxed version pins for Python 3.14+ |
| `backend/app/api/trips.py` | Added `POST /api/trips/{id}/duplicate` endpoint |
| `frontend/src/services/api.ts` | Added `tripsApi.duplicate()` |
| `frontend/src/pages/SavedTripsPage.tsx` | Added Duplicate button |
| `frontend/vite.config.ts` | Added `host: '0.0.0.0'` for phone access |
| `backend/.env` | Created (not committed — add to .gitignore) |

---

## Step 1 — Push Everything from Windows PC to GitHub

Run these commands in PowerShell in `e:\Vromon`:

```powershell
cd e:\Vromon

# Stage all changes (new files + modifications)
git add .

# Check what will be committed
git status

# Commit
git commit -m "feat: fix map crash, add duplicate trip, fix UTF-8 encoding"

# Push to GitHub
git push origin main
```

> [!IMPORTANT]
> The `backend/.env` file contains secrets and should NOT be committed. Make sure it is in `.gitignore`. You can check:
> ```powershell
> git status   # .env should NOT appear in the list
> ```
> If it appears, run: `echo "backend/.env" >> .gitignore`

---

## Step 2 — Pull on MacBook Air

Open **Terminal** on your Mac and run:

```bash
# Navigate to where you want the project
cd ~/Developer   # or wherever you keep projects

# Clone the repo (first time)
git clone https://github.com/YOUR_USERNAME/Vromon.git
cd Vromon

# OR if you already have it cloned, just pull
git pull origin main
```

---

## Step 3 — Backend Setup on MacBook Air

```bash
# Make sure Python 3.11+ is installed
# If not: brew install python  (requires Homebrew: https://brew.sh)
python3 --version

# Create a virtual environment
cd backend
python3 -m venv venv

# Activate it (Mac/Linux uses 'source', not 'venv\Scripts\activate')
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create the .env file (needed — not committed to git)
cp ../.env.example .env

# Start the backend
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     [OK] Database seeded with Cox's Bazar demo data.
```

---

## Step 4 — Frontend Setup on MacBook Air

Open a **second Terminal tab** (`Cmd+T`):

```bash
# Make sure Node.js is installed
# If not: brew install node
node --version   # should be 18+

cd ~/Developer/Vromon/frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

You should see:
```
  VITE v8.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/   Wi-Fi
```

Open **http://localhost:5173** in Safari or Chrome.

---

## Step 5 — Access from iPhone/iPad (Same WiFi)

1. Find your Mac's IP address:
   ```bash
   ipconfig getifaddr en0
   # Example output: 192.168.0.105
   ```
2. Open `http://192.168.0.105:5173` on your phone's browser.

> [!NOTE]
> The Vite proxy automatically forwards `/api` calls to `localhost:8000`, so both frontend and backend must be running on your Mac for the phone to work.

---

## Day-to-Day Development Workflow

### On Windows PC → push changes:
```powershell
cd e:\Vromon
git add .
git commit -m "your message here"
git push origin main
```

### On MacBook Air → pull changes and continue:
```bash
cd ~/Developer/Vromon
git pull origin main

# If new Python packages were added:
cd backend && source venv/bin/activate && pip install -r requirements.txt && cd ..

# If new npm packages were added:
cd frontend && npm install && cd ..

# Start both servers
# Terminal 1:
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 2:
cd frontend && npm run dev
```

---

## Useful Commands Reference

| Task | Windows (PowerShell) | Mac (Terminal) |
|---|---|---|
| Activate Python venv | `venv\Scripts\activate` | `source venv/bin/activate` |
| Deactivate venv | `deactivate` | `deactivate` |
| Start backend | `uvicorn app.main:app --reload --port 8000` | same |
| Start frontend | `npm run dev` | same |
| Run tests | `python -m pytest tests/ -v` | same |
| Find Mac IP | `ipconfig` | `ipconfig getifaddr en0` |
| Open Swagger API docs | `http://localhost:8000/docs` | same |

---

## What's in .gitignore (should NOT be committed)

Make sure `e:\Vromon\.gitignore` contains at least:
```
backend/.env
backend/vromon.db
backend/venv/
frontend/node_modules/
__pycache__/
*.pyc
.DS_Store
```
