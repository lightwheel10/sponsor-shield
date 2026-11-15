"""Server settings, read once at start-up from environment variables.

Secrets (the DeepSeek key and the hashing secret) only ever come from the
environment. On the VPS, systemd reads them from a root-only file before the
service starts, so the service account itself cannot open that file.
"""
import os
from dataclasses import dataclass


class SettingsError(RuntimeError):
    """A required setting is missing or invalid."""


@dataclass(frozen=True)
class Settings:
    deepseek_api_key: str
    # Used to turn IP addresses and install IDs into one-way codes before they
    # are stored, so the database never holds anyone's real address.
    hash_secret: bytes
    database_path: str
    host: str = "127.0.0.1"
    port: int = 8787
    # Hard ceiling on AI spending per UTC day. When it is reached, AI checks
    # stop until the next day and the extension falls back to SponsorBlock.
    daily_budget_usd: float = 3.0
    max_parallel_ai_jobs: int = 4
    max_waiting_ai_jobs: int = 20
    # Stops one video from being re-checked over and over with different
    # (possibly fake) transcripts.
    max_ai_runs_per_video_per_day: int = 3
    # How many different viewers (different installs AND different networks)
    # must send the same transcript before its answer is shared with everyone.
    confirmations_needed: int = 2
    # Optional. When set, the server asks YouTube's official Data API for the
    # real video length and rejects transcripts that do not fit it.
    youtube_api_key: str = ""
    # True when nginx on the same machine passes the visitor's address in the
    # X-Real-IP header. Only trusted for connections coming from this machine.
    trust_proxy_header: bool = True


def _number(env, name, default, kind=float):
    raw = env.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return kind(raw)
    except ValueError as error:
        raise SettingsError(f"{name} must be a number, got {raw!r}") from error


def load_settings(env=None):
    env = os.environ if env is None else env
    api_key = env.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise SettingsError("DEEPSEEK_API_KEY is not set")
    secret = env.get("SHIELD_HASH_SECRET", "").strip()
    if len(secret) < 32:
        raise SettingsError("SHIELD_HASH_SECRET must be at least 32 characters")
    settings = Settings(
        deepseek_api_key=api_key,
        hash_secret=secret.encode(),
        database_path=env.get("SHIELD_DATABASE", "sponsor-shield.sqlite3"),
        host=env.get("SHIELD_HOST", "127.0.0.1"),
        port=_number(env, "SHIELD_PORT", 8787, int),
        daily_budget_usd=_number(env, "SHIELD_DAILY_BUDGET_USD", 3.0),
        max_parallel_ai_jobs=_number(env, "SHIELD_MAX_PARALLEL_AI_JOBS", 4, int),
        max_waiting_ai_jobs=_number(env, "SHIELD_MAX_WAITING_AI_JOBS", 20, int),
        max_ai_runs_per_video_per_day=_number(env, "SHIELD_MAX_AI_RUNS_PER_VIDEO_PER_DAY", 3, int),
        confirmations_needed=_number(env, "SHIELD_CONFIRMATIONS_NEEDED", 2, int),
        youtube_api_key=env.get("YOUTUBE_API_KEY", "").strip(),
        trust_proxy_header=env.get("SHIELD_TRUST_PROXY_HEADER", "1") != "0",
    )
    if settings.daily_budget_usd < 0:
        raise SettingsError("SHIELD_DAILY_BUDGET_USD cannot be negative")
    if settings.max_parallel_ai_jobs < 1 or settings.confirmations_needed < 1:
        raise SettingsError("job and confirmation limits must be at least 1")
    return settings
