# Vromon — Setup & Run Guide

## Quick Start — Every Time You Work

### Windows (PowerShell)

Open **two PowerShell windows**:

**Window 1 — Backend:**
```powershell
cd e:\Vromon\backend
venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Window 2 — Frontend:**
```powershell
cd e:\Vromon\frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

### MacBook Air (Terminal)

Open **two Terminal tabs** (`Cmd+T` for second tab):

**Tab 1 — Backend:**
```bash
cd ~/Developer/Vromon/backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Tab 2 — Frontend:**
```bash
cd ~/Developer/Vromon/frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## First-Time Setup

### Windows (First Time)

```powershell
# Clone the repo
cd e:\
git clone https://github.com/alifalahad/Vromon.git
cd Vromon

# Backend setup
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
cd ..

# Frontend setup
cd frontend
npm install
cd ..
```

### MacBook Air (First Time)

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python and Node if needed
brew install python node

# Clone the repo
cd ~/Developer
git clone https://github.com/alifalahad/Vromon.git
cd Vromon

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
cd ..

# Frontend setup
cd frontend
npm install
cd ..
```

---

## GitHub — Push & Pull

### Push from Windows:
```powershell
cd e:\Vromon
git add .
git status
git commit -m "your message here"
git push origin main
```

### Push from Mac:
```bash
cd ~/Developer/Vromon
git add .
git status
git commit -m "your message here"
git push origin main
```

### Pull on either machine (after the other machine pushed):
```bash
git pull origin main

# If new Python packages were added:
# Windows:  venv\Scripts\activate
# Mac:      source venv/bin/activate
pip install -r requirements.txt

# If new npm packages were added:
cd frontend
npm install
```

---

## Install as Android App (PWA)

1. Start both servers (see Quick Start above)
2. Find your PC/Mac's local IP:
   - **Windows:** run `ipconfig` → look for `IPv4 Address` under Wi-Fi
   - **Mac:** run `ipconfig getifaddr en0`
3. Connect your Android phone to the **same Wi-Fi**
4. Open **Chrome** on your phone → go to `http://<YOUR_IP>:5173`
5. Tap **⋮ menu → "Install app"** or **"Add to Home screen"**
6. Vromon appears on your home screen and runs fullscreen — no browser bar

> [!NOTE]
> An install banner also auto-pops up at the bottom of the screen inside the app on Android Chrome.

---

## Useful Commands Reference

| Task | Windows (PowerShell) | Mac (Terminal) |
|---|---|---|
| Activate Python venv | `venv\Scripts\activate` | `source venv/bin/activate` |
| Deactivate venv | `deactivate` | `deactivate` |
| Start backend | `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` | same |
| Start frontend | `npm run dev` | same |
| Run backend tests | `python -m pytest tests/ -v` | `python3 -m pytest tests/ -v` |
| Find local IP | `ipconfig` | `ipconfig getifaddr en0` |
| Swagger API docs | `http://localhost:8000/docs` | same |
| Git push | `git add .` then `git commit` then `git push origin main` | same |
| Git pull | `git pull origin main` | same |

---

## What You Should See When Running

**Backend terminal:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     [OK] Database seeded with Cox's Bazar demo data.
```

**Frontend terminal:**
```
  VITE v8.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/   Wi-Fi
```

> [!IMPORTANT]
> The `backend/.env` file is NOT committed to git (it's in `.gitignore`). After cloning on a new machine, always create it:
> - **Windows:** `copy .env.example .env` (inside the backend folder)
> - **Mac:** `cp ../.env.example .env` (inside the backend folder)

---

## Verified Working Screenshots

### Day 1 — Beach & Nature itinerary with map
![Day 1](C:/Users/mdsul/.gemini/antigravity-ide/brain/cb2b0823-3218-4ec2-bd5c-c4ca456e5ffc/itinerary_day1_view_1789891909710.png)

### Day 2 — Nature & Food with updated map markers
![Day 2](C:/Users/mdsul/.gemini/antigravity-ide/brain/cb2b0823-3218-4ec2-bd5c-c4ca456e5ffc/itinerary_day2_view_1789891994750.png)
