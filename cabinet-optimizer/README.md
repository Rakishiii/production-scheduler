# Cabinet Optimizer

Python-based optimization system for estimating workers and production days in a small-scale cabinet manufacturing business.

## Project Structure

- backend: Flask API
- frontend: Static HTML, Tailwind CSS, and JavaScript

## Backend Setup (Local)

1. Open a terminal in this project.
2. Create and activate a virtual environment.
3. Install dependencies.
4. Run the Flask server.

Example commands (Windows PowerShell):

- Create venv: `python -m venv .venv`
- Activate venv: `.\.venv\Scripts\Activate.ps1`
- Install deps: `pip install -r backend\requirements.txt`
- Run server: `python backend\app.py`

The API will be available at http://127.0.0.1:5000.

## API Usage

POST /calculate

Request JSON:

{ "type": "basic|premium|custom", "quantity": number }

Response JSON:

{ "workers": number, "days": number }

## Frontend Setup (Local)

1. Open frontend/index.html in a browser.
2. Update BACKEND_URL in frontend/script.js to your backend URL.
   - For local use: http://127.0.0.1:5000

## Deployment Notes

- Deploy the backend to a Python-compatible host.
- Deploy the frontend folder to Netlify as a static site.
- After deployment, update BACKEND_URL in frontend/script.js to the deployed backend URL.

## Notes

- CORS is enabled in the backend to allow cross-origin requests.
- All logic is modularized in backend/formulas.py.
