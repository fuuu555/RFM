import os
import sys
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from data_layer.pipeline import run_all_stages

app = FastAPI(title="Upload Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_LAYER_DIR = BASE_DIR / "data_layer"
UPLOADS_DIR = DATA_LAYER_DIR / "uploads"
TARGET_FILENAME = "data.csv"
CHUNK_SIZE = 4 * 1024 * 1024  # 4MB chunks
DEFAULT_MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = DEFAULT_MAX_UPLOAD_MB * 1024 * 1024

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if file is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未收到檔案")

    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="建立 uploads 資料夾失敗",
        ) from exc

    destination = UPLOADS_DIR / TARGET_FILENAME

    try:
        bytes_written = 0
        with destination.open("wb") as buffer:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"檔案超過 {DEFAULT_MAX_UPLOAD_MB}MB 限制",
                    )
                buffer.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except Exception as exc:  # pylint: disable=broad-except
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="寫入檔案失敗",
        ) from exc
    try:
        pipeline_output = await run_in_threadpool(
            lambda: run_all_stages(stop_on_error=False)
        )
    except Exception as exc:  # pylint: disable=broad-except
        pipeline_output = {
            "stages": [
                {
                    "stage": "pipeline",
                    "status": "error",
                    "error": str(exc),
                }
            ],
            "total_duration_sec": 0.0,
        }

    return {
        "message": "?????",
        "saved_as": TARGET_FILENAME,
        "original_filename": file.filename,
        "size": destination.stat().st_size,
        "max_upload_mb": DEFAULT_MAX_UPLOAD_MB,
        "pipeline_results": pipeline_output["stages"],
        "pipeline_total_seconds": pipeline_output["total_duration_sec"],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        limit_max_request_size=MAX_UPLOAD_BYTES,
    )
