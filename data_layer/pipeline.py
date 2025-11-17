from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Union
import time

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
]


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


def _primary_stages_completed(results: List[Dict], num_stages: int = 6) -> bool:
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
    """Run Stage 1 (function) followed by Stage 2–6 scripts."""
    results: List[Dict] = []
    total_duration = 0.0

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

    for stage_name, script_path in STAGE_SCRIPTS:
        res = _run_script(stage_name, script_path)
        results.append(res)
        total_duration += res.get("duration_sec", 0.0)
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
                    "stage": "Stage 7 - Import to DB",
                    "status": "error",
                    "error": str(exc),
                    "duration_sec": round(duration, 3),
                }
            )
            total_duration += duration
        else:
            duration = time.perf_counter() - import_start
            results.append(
                {
                    "stage": "Stage 7 - Import to DB",
                    "status": "ok",
                    "imported_tables": tables,
                    "duration_sec": round(duration, 3),
                }
            )
            total_duration += duration

    return {"stages": results, "total_duration_sec": round(total_duration, 3)}
