import os
from pathlib import Path
from typing import Optional
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def _load_dotenv_if_present(env_path: Optional[Path]) -> None:
    """Populate os.environ with entries from .env without overriding existing keys."""
    if not env_path or not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


BASE_DIR = Path(__file__).resolve().parent


def _load_env_chain() -> None:
    for parent in [BASE_DIR] + list(BASE_DIR.parents):
        candidate = parent / ".env"
        if candidate.exists():
            _load_dotenv_if_present(candidate)
            return


_load_env_chain()

DB_URL = os.getenv("DATA_DB_URL")
if not DB_URL:
    raise RuntimeError("Missing DATA_DB_URL in environment or .env file.")

engine = create_engine(DB_URL, echo=False, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_engine():
    return engine


def get_session():
    return SessionLocal()
