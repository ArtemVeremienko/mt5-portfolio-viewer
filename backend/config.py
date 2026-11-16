from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables or defaults."""

    model_config = SettingsConfigDict(env_prefix="MT5_VIEWER_", extra="ignore")

    db_path: Path = _ROOT_DIR / "data" / "portfolio.db"
    frontend_dist: Path = _ROOT_DIR / "frontend" / "dist"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    snapshot_interval_sec: int = 60
    broadcast_interval_sec: float = 1.0
    use_simulation_if_offline: bool = True
