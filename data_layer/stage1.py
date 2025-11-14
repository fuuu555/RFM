from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

DATA_LAYER_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = DATA_LAYER_DIR / "uploads"
ARTIFACTS_DIR = DATA_LAYER_DIR / "artifacts"
BASE_OUTPUT_FILE = ARTIFACTS_DIR / "stage1_df_initial_clean.csv"
UPLOAD_FILE = UPLOADS_DIR / "data.csv"


@dataclass
class StageSummary:
  duplicate_rows: int
  rows: int
  cols: int
  artifacts_file: Path

  def as_dict(self) -> dict:
    return {
      "duplicate_rows": self.duplicate_rows,
      "rows": self.rows,
      "cols": self.cols,
      "artifacts_file": str(self.artifacts_file),
    }


def clean_csv(source: Optional[Path] = None) -> StageSummary:
  source = source or UPLOAD_FILE
  if not source.exists():
    raise FileNotFoundError(f"找不到來源檔案：{source}")

  ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
  UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

  df_initial = pd.read_csv(
    source,
    encoding="ISO-8859-1",
    dtype={"CustomerID": str, "InvoiceID": str},
  )

  df_initial["InvoiceDate"] = pd.to_datetime(df_initial["InvoiceDate"])

  df_initial.dropna(axis=0, subset=["CustomerID"], inplace=True)

  dup_count = int(df_initial.duplicated().sum())

  df_initial.drop_duplicates(inplace=True)

  df_initial.to_csv(BASE_OUTPUT_FILE, index=False)

  rows, cols = df_initial.shape

  return StageSummary(
    duplicate_rows=dup_count,
    rows=rows,
    cols=cols,
    artifacts_file=BASE_OUTPUT_FILE,
  )


def run_stage() -> StageSummary:
  return clean_csv()


if __name__ == "__main__":
  try:
    summary = run_stage()
  except FileNotFoundError as err:
    print(str(err))
  else:
    print(f"重複列數量：{summary.duplicate_rows} (Duplicates)\n")
    print(
      f"[Stage 1] Saved: {summary.artifacts_file} "
      f"Dataframe dimensions after dropna: ({summary.rows}, {summary.cols})\n"
      f"已儲存至：{summary.artifacts_file}\n"
      f"清洗後維度（去缺失/去重）：({summary.rows}, {summary.cols})\n"
    )
