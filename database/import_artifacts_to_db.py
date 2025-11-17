import argparse
import re
import sys
from pathlib import Path
from typing import Dict, Iterable, List

import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

try:
    from .db_init import get_engine
except ImportError:  # pragma: no cover - fallback when executed as script via path
    CURRENT_DIR = Path(__file__).resolve().parent
    if str(CURRENT_DIR) not in sys.path:
        sys.path.append(str(CURRENT_DIR))
    from db_init import get_engine  # type: ignore  # noqa: E402

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
SQL_TYPE_MAP = {
    "int": "INT",
    "float": "FLOAT",
    "datetime": "DATETIME",
    "varchar": "VARCHAR(255)",
    "text": "TEXT",
}


def normalize_table_name(file_path: Path) -> str:
    base = file_path.stem.lower().replace(" ", "_")
    base = re.sub(r"[^a-z0-9_]+", "_", base)
    base = re.sub(r"_+", "_", base).strip("_")
    if not base:
        base = "artifact"
    return base


def quote_identifier(identifier: str) -> str:
    return f"`{identifier.replace('`', '``')}`"


def load_dataframe(file_path: Path) -> pd.DataFrame:
    if file_path.suffix.lower() == ".csv":
        return pd.read_csv(file_path)
    return pd.read_excel(file_path)


def _maybe_parse_datetime(series: pd.Series) -> bool:
    parsed = pd.to_datetime(series, errors="coerce")
    return not parsed.isna().any()


def _series_all_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def infer_column_label(series: pd.Series) -> str:
    non_null = series.dropna()
    if non_null.empty:
        return "text"

    if pd.api.types.is_integer_dtype(non_null) or pd.api.types.is_bool_dtype(non_null):
        return "int"
    if pd.api.types.is_float_dtype(non_null):
        non_null_float = non_null.astype(float)
        if np.isclose(non_null_float % 1, 0).all():
            return "int"
        return "float"
    if pd.api.types.is_datetime64_any_dtype(non_null):
        return "datetime"

    if pd.api.types.is_object_dtype(non_null) or pd.api.types.is_string_dtype(non_null):
        if _maybe_parse_datetime(non_null):
            return "datetime"
        numeric_series = _series_all_numeric(non_null)
        if not numeric_series.isna().any():
            if np.isclose(numeric_series % 1, 0).all():
                return "int"
            return "float"

    max_len = int(non_null.astype(str).map(len).max())
    if max_len <= 255:
        return "varchar"
    return "text"


def infer_schema(df: pd.DataFrame) -> Dict[str, str]:
    schema: Dict[str, str] = {}
    for column in df.columns:
        schema[str(column)] = infer_column_label(df[column])
    return schema


def cast_dataframe(df: pd.DataFrame, schema: Dict[str, str]) -> pd.DataFrame:
    converted = df.copy()
    for column, label in schema.items():
        if label == "int":
            converted[column] = pd.to_numeric(converted[column], errors="coerce").astype("Int64")
        elif label == "float":
            converted[column] = pd.to_numeric(converted[column], errors="coerce")
        elif label == "datetime":
            converted[column] = pd.to_datetime(converted[column], errors="coerce")
        else:
            # leave as-is for varchar/text to preserve original formatting
            pass

    converted = converted.replace({pd.NaT: None})
    converted = converted.replace({np.nan: None})
    converted = converted.where(pd.notnull(converted), None)
    return converted


def recreate_table(engine: Engine, table_name: str, schema: Dict[str, str]) -> None:
    column_definitions = ", ".join(
        f"{quote_identifier(column)} {SQL_TYPE_MAP[label]}" for column, label in schema.items()
    )
    if not column_definitions:
        raise ValueError(f"資料表 {table_name} 沒有任何欄位，無法建立。")

    ddl = (
        f"CREATE TABLE {quote_identifier(table_name)} ({column_definitions}) "
        "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    )

    with engine.begin() as connection:
        connection.execute(text(f"DROP TABLE IF EXISTS {quote_identifier(table_name)}"))
        connection.execute(text(ddl))


def insert_dataframe(engine: Engine, table_name: str, df: pd.DataFrame) -> None:
    if df.empty:
        return
    df.to_sql(table_name, engine, if_exists="append", index=False, method="multi", chunksize=2000)


def iter_artifacts(folder: Path) -> Iterable[Path]:
    for path in sorted(folder.rglob("*")):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            yield path


def import_all_artifacts_to_db(folder_path: str) -> List[str]:
    folder = Path(folder_path).expanduser().resolve()
    if not folder.exists():
        repo_root = Path(__file__).resolve().parents[1]
        fallback = repo_root / "data_layer" / folder.name
        if fallback.exists():
            folder = fallback
        else:
            raise FileNotFoundError(f"Folder not found: {folder}")

    engine = get_engine()
    artifacts = list(iter_artifacts(folder))
    if not artifacts:
        print(f"在 {folder} 未找到任何 CSV 或 Excel 檔案。")
        return []

    imported_tables: List[str] = []

    for artifact_path in artifacts:
        table_name = normalize_table_name(artifact_path)
        print(f"Processing {artifact_path.name} → table `{table_name}`")
        dataframe = load_dataframe(artifact_path)
        schema = infer_schema(dataframe)
        recreate_table(engine, table_name, schema)
        casted_df = cast_dataframe(dataframe, schema)
        insert_dataframe(engine, table_name, casted_df)
        print(f"完成匯入：{table_name}")
        imported_tables.append(table_name)

    return imported_tables


def parse_args(args: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import Stage 1–6 artifacts into MySQL.")
    default_artifacts = Path(__file__).resolve().parents[1] / "data_layer" / "artifacts"
    parser.add_argument(
        "--folder",
        default=str(default_artifacts),
        help=f"Path to the artifacts folder (default: {default_artifacts}).",
    )
    return parser.parse_args(args)


def main(cli_args: List[str]) -> None:
    args = parse_args(cli_args)
    try:
        tables = import_all_artifacts_to_db(args.folder)
    except (SQLAlchemyError, FileNotFoundError, ValueError) as exc:
        print(f"匯入失敗：{exc}")
        raise
    else:
        if tables:
            joined = ", ".join(tables)
            print(f"已匯入 {len(tables)} 個資料表：{joined}")
        else:
            print("沒有匯入任何資料表。")


if __name__ == "__main__":
    main(sys.argv[1:])
