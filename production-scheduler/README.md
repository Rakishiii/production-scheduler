# Production Scheduler

Web-based production scheduling system for manufacturing. Track cabinet orders, monitor daily progress, and allocate machines based on priority.

## Features

- Add orders with customer details, cabinet type, color, quantity, and completion date
- Auto-calculate daily progress (divided equally across production days)
- Auto-flag orders as PRIORITY if completion ≤2 days (allocates 6 machines vs 1)
- Table view with status, priority, progress bar, and completion percentage
- Print-friendly Gantt chart view
- Real-time progress updates (refreshes every 5 seconds)

## Project Structure

- backend: Flask API with JSON file storage
- frontend: Static HTML, Tailwind CSS, and JavaScript

## Setup (Local)

1. Create and activate a virtual environment.
   - Windows PowerShell: `python -m venv .venv` then `.\.venv\Scripts\Activate.ps1`
   - macOS/Linux: `python -m venv .venv` then `source .venv/bin/activate`

2. Install dependencies.
   ```bash
   pip install -r backend/requirements.txt
   ```

3. Run the Flask backend.
   ```bash
   python backend/app.py
   ```
   Backend will run at http://127.0.0.1:5000

4. Open frontend/index.html in a browser and add orders.

## How It Works

- **Order Form**: Enter customer name, cabinet type, color, quantity, and desired completion date.
- **Progress**: System calculates daily progress automatically (100% / number of days).
- **Priority**: Orders with ≤2 days to completion are flagged as PRIORITY and assigned 6 machines.
- **Print**: Click "Print" button to print the table (optimized for paper).

## Cabinet Types

- Tall Cabinet
- Hanging Cabinet
- Shelves

## Storage

Orders are stored in `orders.json` in the backend directory. Data persists between restarts.

## Notes

- CORS is enabled for local frontend-backend communication.
- Progress updates automatically each day based on elapsed time.
- Machines allocated: 1 (standard) or 6 (priority).
