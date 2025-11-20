from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Union
import time
import json

from . import stage1
from database.import_artifacts_to_db import import_all_artifacts_to_db

DATA_LAYER_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = DATA_LAYER_DIR / "artifacts"

STAGE_SCRIPTS = [
    ("Stage 2", DATA_LAYER_DIR / "stage2_explore_data.py"),
    ("Stage 3", DATA_LAYER_DIR / "stage3.py"),
    ("Stage 4", DATA_LAYER_DIR / "stage4_customer_segmentation.py"),
    ("Stage 5", DATA_LAYER_DIR / "stage5_classification.py"),
    ("Stage 6", DATA_LAYER_DIR / "stage6_testing_predictions.py"),
    ("Stage 7", DATA_LAYER_DIR / "stage7.py"),
]

# Estimated seconds per stage (used to compute remaining time on server-side)
STAGE_ESTIMATES: Dict[str, int] = {
    "Stage 1": 5,
    "Stage 2": 8,
    "Stage 3": 12,
    "Stage 4": 15,
    "Stage 5": 18,
    "Stage 6": 10,
    "Stage 7": 12,
    "Stage 8 - Import to DB": 6,
}


def _run_script(stage_name: str, script_path: Path) -> Dict:
    """Execute a stage script and capture stdout/stderr for logging."""
    result = {
        "stage": stage_name,
        "script": str(script_path),
        "status": "pending",
        "stdout": "",
        "stderr": "",
        "returncode": None,
    }

    start = time.perf_counter()
    completed = subprocess.run(  # noqa: PLW1510 - intentional blocking call
        [sys.executable, str(script_path)],
        cwd=str(DATA_LAYER_DIR),
        capture_output=True,
        text=True,
    )

    result["returncode"] = completed.returncode
    result["stdout"] = completed.stdout
    result["stderr"] = completed.stderr
    result["status"] = "ok" if completed.returncode == 0 else "error"
    result["duration_sec"] = round(time.perf_counter() - start, 3)
    return result


def _write_pipeline_status(
    artifacts_dir: Path,
    *,
    status: str,
    current_stage: str | None = None,
    completed_est_sec: float | None = None,
    total_est_sec: float | None = None,
    message: str | None = None,
):
    try:
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        status_path = artifacts_dir / "pipeline_status.json"

        percent = None
        remaining = None
        if total_est_sec is not None and completed_est_sec is not None and total_est_sec > 0:
            percent = int(min(100, max(0, round((completed_est_sec / total_est_sec) * 100))))
            remaining = max(0, int(round(total_est_sec - completed_est_sec)))

        payload = {
            "status": status,
            "current_stage": current_stage,
            "percent": percent,
            "estimated_total_sec": int(total_est_sec) if total_est_sec is not None else None,
            "estimated_remaining_sec": remaining,
            "message": message,
            "timestamp": time.time(),
            "logs": "/artifacts/pipeline_logs.txt",
        }
        with open(status_path, "w", encoding="utf-8") as sf:
            json.dump(payload, sf)
    except Exception as e:
        print(f"Warning: failed to write pipeline status: {e}")


def _append_pipeline_log(artifacts_dir: Path, entry: str):
    try:
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        log_path = artifacts_dir / "pipeline_logs.txt"
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        with open(log_path, "a", encoding="utf-8") as lf:
            lf.write(f"[{ts}] {entry}\n")
    except Exception as e:
        print(f"Warning: failed to append pipeline log: {e}")


def _primary_stages_completed(results: List[Dict], num_stages: int = 7) -> bool:
    expected = {f"Stage {idx}" for idx in range(1, num_stages + 1)}
    completed = {
        res["stage"]: res
        for res in results
        if res.get("stage") in expected
    }
    if len(completed) != len(expected):
        return False
    return all(res.get("status") == "ok" for res in completed.values())


def run_all_stages(stop_on_error: bool = False) -> Dict[str, Union[List[Dict], float]]:
    """Run Stage 1 (function) followed by Stage 2–7 scripts."""
    results: List[Dict] = []
    total_duration = 0.0

    # Prepare progress tracking (use estimated seconds for better remaining-time accuracy)
    total_est_seconds = 0
    total_est_seconds += STAGE_ESTIMATES.get("Stage 1", 0)
    for name, _ in STAGE_SCRIPTS:
        total_est_seconds += STAGE_ESTIMATES.get(name, 0)
    total_est_seconds += STAGE_ESTIMATES.get("Stage 8 - Import to DB", 0)

    completed_steps = 0
    completed_est_seconds = 0

    # mark started (no progress yet)
    _write_pipeline_status(
        ARTIFACTS_DIR,
        status="running",
        current_stage="initializing",
        completed_est_sec=completed_est_seconds,
        total_est_sec=total_est_seconds,
        message="Pipeline started",
    )

    stage1_start = time.perf_counter()
    try:
        summary = stage1.run_stage()
    except Exception as exc:  # pylint: disable=broad-except
        duration = time.perf_counter() - stage1_start
        results.append(
            {
                "stage": "Stage 1",
                "status": "error",
                "error": str(exc),
                "duration_sec": round(duration, 3),
            }
        )
        total_duration += duration
        _append_pipeline_log(ARTIFACTS_DIR, f"Stage 1 failed: {exc}")
        _write_pipeline_status(
            ARTIFACTS_DIR,
            status="failed",
            current_stage="Stage 1",
            completed_est_sec=completed_est_seconds,
            total_est_sec=total_est_seconds,
            message=str(exc),
        )
        if stop_on_error:
            return {"stages": results, "total_duration_sec": round(total_duration, 3)}
    else:
        duration = time.perf_counter() - stage1_start
        results.append(
            {
                "stage": "Stage 1",
                "status": "ok",
                "summary": summary.as_dict(),
                "duration_sec": round(duration, 3),
            }
        )
        total_duration += duration
        completed_steps += 1
        # add estimated seconds for Stage 1
        completed_est_seconds += STAGE_ESTIMATES.get("Stage 1", 0)
        _append_pipeline_log(ARTIFACTS_DIR, "Stage 1 completed")
        _write_pipeline_status(
            ARTIFACTS_DIR,
            status="running",
            current_stage="Stage 1",
            completed_est_sec=completed_est_seconds,
            total_est_sec=total_est_seconds,
            message="Stage 1 completed",
        )

    for stage_name, script_path in STAGE_SCRIPTS:
        # announce stage start
        _write_pipeline_status(
            ARTIFACTS_DIR,
            status="running",
            current_stage=stage_name,
            completed_est_sec=completed_est_seconds,
            total_est_sec=total_est_seconds,
            message=f"Starting {stage_name}",
        )
        _append_pipeline_log(ARTIFACTS_DIR, f"Starting {stage_name} ({script_path})")

        res = _run_script(stage_name, script_path)
        # save stdout/stderr to log for visibility
        if res.get("stdout"):
            _append_pipeline_log(ARTIFACTS_DIR, f"{stage_name} stdout:\n{res.get('stdout')}")
        if res.get("stderr"):
            _append_pipeline_log(ARTIFACTS_DIR, f"{stage_name} stderr:\n{res.get('stderr')}")

        results.append(res)
        total_duration += res.get("duration_sec", 0.0)
        completed_steps += 1
        # increment estimated seconds only when stage finished (treat error as finished for progress)
        completed_est_seconds += STAGE_ESTIMATES.get(stage_name, 0)
        _write_pipeline_status(
            ARTIFACTS_DIR,
            status="running",
            current_stage=stage_name,
            completed_est_sec=completed_est_seconds,
            total_est_sec=total_est_seconds,
            message=f"{stage_name} finished: {res.get('status')}",
        )
        if stop_on_error and res["status"] == "error":
            break

    if _primary_stages_completed(results):
        import_start = time.perf_counter()
        try:
            tables = import_all_artifacts_to_db(str(ARTIFACTS_DIR))
        except Exception as exc:  # pylint: disable=broad-except
            duration = time.perf_counter() - import_start
            results.append(
                {
                    "stage": "Stage 8 - Import to DB",
                    "status": "error",
                    "error": str(exc),
                    "duration_sec": round(duration, 3),
                }
            )
            total_duration += duration
            completed_steps += 1
            completed_est_seconds += STAGE_ESTIMATES.get("Stage 8 - Import to DB", 0)
            _append_pipeline_log(ARTIFACTS_DIR, f"Stage 8 import failed: {exc}")
            _write_pipeline_status(
                ARTIFACTS_DIR,
                status="failed",
                current_stage="Stage 8 - Import to DB",
                completed_est_sec=completed_est_seconds,
                total_est_sec=total_est_seconds,
                message=str(exc),
            )
        else:
            duration = time.perf_counter() - import_start
            results.append(
                {
                    "stage": "Stage 8 - Import to DB",
                    "status": "ok",
                    "imported_tables": tables,
                    "duration_sec": round(duration, 3),
                }
            )
            total_duration += duration
            completed_steps += 1
            completed_est_seconds += STAGE_ESTIMATES.get("Stage 8 - Import to DB", 0)
            _append_pipeline_log(ARTIFACTS_DIR, f"Stage 8 import ok: imported {len(tables)} tables")
            _write_pipeline_status(
                ARTIFACTS_DIR,
                status="running",
                current_stage="Stage 8 - Import to DB",
                completed_est_sec=completed_est_seconds,
                total_est_sec=total_est_seconds,
                message="Import completed",
            )

    # final status: check overall success
    overall_ok = all((r.get("status") == "ok") for r in results if r.get("stage"))
    final_status = "done" if overall_ok else "failed"
    _write_pipeline_status(
        ARTIFACTS_DIR,
        status=final_status,
        current_stage=None,
        completed_est_sec=total_est_seconds if overall_ok else completed_est_seconds,
        total_est_sec=total_est_seconds,
        message="Pipeline finished" if overall_ok else "Pipeline finished with errors",
    )

    return {"stages": results, "total_duration_sec": round(total_duration, 3)}
