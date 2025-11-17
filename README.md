# RFM Pipeline + Viewer

This project combines a Vite/React frontend, a FastAPI backend, and Stage 1–6 data-processing scripts. After a user uploads a dataset, the backend runs every stage, writes cleaned outputs to `data_layer/artifacts/`, and (if all stages succeed) pushes those artifacts into MySQL so the Viewer can query structured tables instead of Excel/CSV.

## Components

| Layer     | Location / Tech | Notes |
|-----------|-----------------|-------|
| Frontend  | `frontend/` – React 18 + Vite | `src/Upload.jsx` handles uploads and progress, `src/Viewer.jsx` plus sub-pages render KPI dashboards. |
| Backend   | `backend/server.py` – FastAPI | Exposes `POST /upload`, saves `data_layer/uploads/data.csv`, and calls `data_layer.pipeline.run_all_stages`. |
| Stages    | `data_layer/` – pandas / numpy / scikit-learn / nltk | Stage1–6 scripts emit CSV/XLSX into `data_layer/artifacts`. |
| Database  | `database/` – SQLAlchemy, PyMySQL, pandas | `db_init.py` loads `DATA_DB_URL`; `import_artifacts_to_db.py` scans artifacts, infers schema, recreates tables, and inserts all data. |

## Directory Overview

```
backend/                  FastAPI service + upload API
data_layer/               Stage scripts, uploads, artifacts, pipeline helper
├─ artifacts/             Stage outputs that flow to MySQL
├─ pipeline.py            Orchestrates Stage1–6 and Stage7 (DB import)
database/                 DB helpers
├─ __init__.py
├─ db_init.py             SQLAlchemy engine/session bootstrap
├─ import_artifacts_to_db.py   Standalone importer (also used by Stage7)
frontend/                 Entire Vite app (package.json, node_modules, src, public…)
.env                      Stores DATA_DB_URL
```

## Environment

Create `.env` in the repo root (already provided in this project):

```
DATA_DB_URL=mysql+pymysql://root:0505@localhost:3306/stages
```

> The importer drops/recreates tables but does **not** create the database itself. Create it manually (`CREATE DATABASE stages CHARACTER SET utf8mb4;`) before running the pipeline.

### Backend / Stages

Requirements: Python 3.10+ (3.11 recommended). Setup (PowerShell example):

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install fastapi uvicorn pandas numpy scikit-learn joblib nltk sqlalchemy pymysql openpyxl

# Download NLTK data for Stage3 once
python - <<'PY'
import nltk
for pkg in ("punkt", "averaged_perceptron_tagger"):
    try:
        nltk.data.find(f"tokenizers/{pkg}" if pkg == "punkt" else f"taggers/{pkg}")
    except LookupError:
        nltk.download(pkg)
PY

# run from the repository root (RFM/)
uvicorn backend.server:app --reload --port 8000
```

Every upload triggers:
1. File saved as `data_layer/uploads/data.csv`.
2. Stage1 function (cleaning) then Stage2–6 scripts run sequentially.
3. Results are returned via `pipeline_results` to the frontend for progress display.
4. If Stage1–6 all succeed, Stage7 starts: `database.import_artifacts_to_db` scans `data_layer/artifacts`, infers column types, drops/recreates tables, and inserts data into MySQL.

You can also run the pipeline manually:

```bash
python - <<'PY'
from data_layer.pipeline import run_all_stages
print(run_all_stages(stop_on_error=False))
PY
```

### Frontend

Requirements: Node.js 18+. Run every command from the `frontend/` directory:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build
npm run preview
```

The frontend reads `VITE_API_BASE_URL` (defaults to `http://localhost:8000`) to talk to FastAPI. After Stage7 completes, you can build APIs that read from MySQL for the Viewer.

## Manual Import

To import artifacts without running the entire pipeline:

```bash
python -m database.import_artifacts_to_db --folder D:/python/webtest/RFM/data_layer/artifacts
```

The script prints the tables it created. It uses the same logic as Stage7.

## Troubleshooting

- **Stage7 import errors**: ensure MySQL is running, `.env` is correct, and the target database exists. The importer drops tables automatically before recreating them.
- **Missing NLTK data**: rerun the download snippet above.
- **Encoding issues on Windows**: use `chcp 65001` to switch the console to UTF-8.
- **Need to rerun the pipeline**: delete stale files under `data_layer/artifacts/` (optional) and upload a new dataset; each run overwrites the MySQL tables.

## License

Sample project for showcasing an automated RFM pipeline plus dashboard. Add your own license terms if releasing publicly.
