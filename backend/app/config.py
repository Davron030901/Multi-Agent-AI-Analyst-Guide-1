"""F1 - Configuration.

Every key is read from a local ``.env`` via python-dotenv. Nothing is ever
hardcoded and nothing is ever committed.

Design rule enforced here:
  * GOOGLE_API_KEY is REQUIRED  -> fail fast, with an actionable message.
  * TAVILY / LANGFUSE / DEEPSEEK are OPTIONAL -> degrade gracefully, never crash.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Locate and load .env. We search the repo root first (../../.env from here),
# then the backend dir, then the cwd - so it works from anywhere.
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

for candidate in (REPO_ROOT / ".env", BACKEND_DIR / ".env", Path.cwd() / ".env"):
    if candidate.exists():
        load_dotenv(candidate, override=False)


class MissingKeyError(RuntimeError):
    """Raised when a genuinely required key is absent."""


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _resolve(path_str: str) -> Path:
    """Resolve a relative path against the backend dir, not the cwd.

    Means `python -m app.api` and `cd backend && uvicorn ...` both find the DB.
    """
    p = Path(path_str).expanduser()
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


@dataclass(frozen=True)
class Settings:
    # --- LLM ---------------------------------------------------------------
    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "gemini").lower())
    google_api_key: str = field(default_factory=lambda: _env("GOOGLE_API_KEY"))
    gemini_model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-2.5-flash"))
    gemini_embed_model: str = field(
        default_factory=lambda: _env("GEMINI_EMBED_MODEL", "models/gemini-embedding-001")
    )
    embed_dim: int = field(default_factory=lambda: _env_int("EMBED_DIM", 768))
    llm_temperature: float = field(default_factory=lambda: _env_float("LLM_TEMPERATURE", 0.0))

    deepseek_api_key: str = field(default_factory=lambda: _env("DEEPSEEK_API_KEY"))
    deepseek_model: str = field(default_factory=lambda: _env("DEEPSEEK_MODEL", "deepseek-chat"))

    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))
    openai_model: str = field(default_factory=lambda: _env("OPENAI_MODEL", "gpt-4o-mini"))
    openai_embed_model: str = field(
        default_factory=lambda: _env("OPENAI_EMBED_MODEL", "text-embedding-3-small")
    )
    # Optional: point at a proxy or an OpenAI-compatible gateway.
    openai_base_url: str = field(default_factory=lambda: _env("OPENAI_BASE_URL"))

    # "" = auto (follow the LLM provider where possible). Or force: gemini | openai.
    embed_provider_raw: str = field(default_factory=lambda: _env("EMBED_PROVIDER").lower())

    # --- optional integrations --------------------------------------------
    tavily_api_key: str = field(default_factory=lambda: _env("TAVILY_API_KEY"))
    langfuse_public_key: str = field(default_factory=lambda: _env("LANGFUSE_PUBLIC_KEY"))
    langfuse_secret_key: str = field(default_factory=lambda: _env("LANGFUSE_SECRET_KEY"))
    langfuse_host: str = field(
        default_factory=lambda: _env("LANGFUSE_HOST", "https://cloud.langfuse.com")
    )

    # --- vector store ------------------------------------------------------
    qdrant_path: str = field(default_factory=lambda: _env("QDRANT_PATH", "./data/qdrant"))
    qdrant_url: str = field(default_factory=lambda: _env("QDRANT_URL"))
    qdrant_api_key: str = field(default_factory=lambda: _env("QDRANT_API_KEY"))
    qdrant_collection: str = field(
        default_factory=lambda: _env("QDRANT_COLLECTION", "analyst_docs")
    )
    qdrant_memory_collection: str = field(
        default_factory=lambda: _env("QDRANT_MEMORY_COLLECTION", "analyst_memory")
    )

    # --- data agent --------------------------------------------------------
    sqlite_path: str = field(default_factory=lambda: _env("SQLITE_PATH", "./data/company.db"))

    # --- code agent sandbox ------------------------------------------------
    code_timeout_seconds: int = field(default_factory=lambda: _env_int("CODE_TIMEOUT_SECONDS", 15))
    code_memory_limit_mb: int = field(default_factory=lambda: _env_int("CODE_MEMORY_LIMIT_MB", 512))

    # --- graph rails -------------------------------------------------------
    recursion_limit: int = field(default_factory=lambda: _env_int("RECURSION_LIMIT", 25))
    max_revisions: int = field(default_factory=lambda: _env_int("MAX_REVISIONS", 2))
    retriever_top_k: int = field(default_factory=lambda: _env_int("RETRIEVER_TOP_K", 4))
    memory_top_k: int = field(default_factory=lambda: _env_int("MEMORY_TOP_K", 3))

    # --- server ------------------------------------------------------------
    port: int = field(default_factory=lambda: _env_int("PORT", 8000))
    cors_origins_raw: str = field(
        default_factory=lambda: _env("CORS_ORIGINS", "http://localhost:3000")
    )
    # Vercel mints a NEW hostname for every deployment
    # (`project-<hash>.vercel.app`), so an exact-match allowlist breaks on the
    # next push. A regex scoped to your own project prefix survives that
    # without opening the API to every site on vercel.app.
    cors_origin_regex: str = field(default_factory=lambda: _env("CORS_ORIGIN_REGEX"))

    # ---------------------------------------------------------------------
    # Derived helpers
    # ---------------------------------------------------------------------
    @property
    def db_path(self) -> Path:
        return _resolve(self.sqlite_path)

    @property
    def db_uri(self) -> str:
        """Read-only SQLite URI (constraint #3: the data agent cannot write)."""
        return f"sqlite:///file:{self.db_path.as_posix()}?mode=ro&uri=true"

    @property
    def db_uri_rw(self) -> str:
        """Read/write URI - used ONLY by the seed script, never by an agent."""
        return f"sqlite:///{self.db_path.as_posix()}"

    @property
    def qdrant_dir(self) -> Path:
        return _resolve(self.qdrant_path)

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    # --- capability flags: every optional integration is checked, not assumed
    @property
    def has_tavily(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def has_langfuse(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)

    @property
    def has_deepseek(self) -> bool:
        return bool(self.deepseek_api_key)

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_gemini(self) -> bool:
        return bool(self.google_api_key)

    # --- which model actually answers, and which one embeds -----------------
    @property
    def chat_model(self) -> str:
        return {
            "openai": self.openai_model,
            "deepseek": self.deepseek_model,
        }.get(self.llm_provider, self.gemini_model)

    @property
    def embed_provider(self) -> str:
        """Resolve the embedding backend.

        DeepSeek ships no embedding endpoint, so it can never be the answer.
        Auto-resolution: follow the LLM provider when it has embeddings,
        otherwise use whichever key is present (Gemini first - it is free).
        """
        forced = self.embed_provider_raw
        if forced in ("gemini", "openai"):
            return forced
        if self.llm_provider == "openai" and self.has_openai:
            return "openai"
        if self.has_gemini:
            return "gemini"
        if self.has_openai:
            return "openai"
        return "gemini"  # nothing set: report gemini so the error message is the right one

    @property
    def embed_model(self) -> str:
        return self.openai_embed_model if self.embed_provider == "openai" else self.gemini_embed_model

    @property
    def uses_qdrant_cloud(self) -> bool:
        return bool(self.qdrant_url)

    # ---------------------------------------------------------------------
    @property
    def llm_key_present(self) -> bool:
        return {
            "openai": self.has_openai,
            "deepseek": self.has_deepseek,
        }.get(self.llm_provider, self.has_gemini)

    @property
    def embed_key_present(self) -> bool:
        return self.has_openai if self.embed_provider == "openai" else self.has_gemini

    def require_llm_key(self) -> None:
        """Fail fast with an actionable message if a required key is absent.

        Two keys matter and they are not always the same one: the chat model,
        and the embedding model. DeepSeek in particular has no embeddings, so it
        always needs Gemini or OpenAI alongside it.
        """
        if self.llm_provider == "openai" and not self.has_openai:
            raise MissingKeyError(
                "LLM_PROVIDER=openai but OPENAI_API_KEY is not set.\n"
                "  -> Get a key at https://platform.openai.com/api-keys and add it to .env,\n"
                "     or set LLM_PROVIDER=gemini (free, no credit card)."
            )

        if self.llm_provider == "deepseek" and not self.has_deepseek:
            raise MissingKeyError(
                "LLM_PROVIDER=deepseek but DEEPSEEK_API_KEY is not set.\n"
                "  -> Get a key at https://platform.deepseek.com and add it to .env,\n"
                "     or set LLM_PROVIDER=gemini."
            )

        if self.llm_provider not in ("openai", "deepseek") and not self.has_gemini:
            raise MissingKeyError(
                "GOOGLE_API_KEY is not set - it is the default chat + embedding provider.\n"
                "  1. Get a free key (no credit card): https://aistudio.google.com/apikey\n"
                "  2. cp .env.example .env\n"
                "  3. Put the key in .env as GOOGLE_API_KEY=...\n"
                "  Alternatively set LLM_PROVIDER=openai and OPENAI_API_KEY=...\n"
                f"     (looked for .env in {REPO_ROOT} and {BACKEND_DIR})"
            )

        if not self.embed_key_present:
            needed = "OPENAI_API_KEY" if self.embed_provider == "openai" else "GOOGLE_API_KEY"
            raise MissingKeyError(
                f"Embeddings resolve to '{self.embed_provider}' but {needed} is not set.\n"
                f"  LLM_PROVIDER={self.llm_provider} has no usable embedding endpoint on its own.\n"
                f"  -> Set {needed}, or force the other backend with EMBED_PROVIDER="
                f"{'gemini' if self.embed_provider == 'openai' else 'openai'}."
            )

    def capability_report(self) -> str:
        """One-glance startup banner - shows what will and will not run."""
        def mark(ok: bool) -> str:
            return "on " if ok else "off"

        return "\n".join(
            [
                "Multi-Agent AI Analyst - capabilities",
                f"  LLM ({self.llm_provider:<8})    [{mark(self.llm_key_present)}]  {self.chat_model}",
                f"  Embeddings ({self.embed_provider:<6}) [{mark(self.embed_key_present)}]  "
                f"{self.embed_model} (dim {self.embed_dim})",
                f"  Qdrant              [on ]  "
                f"{'cloud ' + self.qdrant_url if self.uses_qdrant_cloud else 'embedded ' + str(self.qdrant_dir)}",
                f"  SQLite (read-only)  [{mark(self.db_path.exists())}]  {self.db_path}",
                f"  Tavily web search   [{mark(self.has_tavily)}]  "
                f"{'' if self.has_tavily else '(web agent will skip cleanly)'}",
                f"  Langfuse tracing    [{mark(self.has_langfuse)}]  "
                f"{'' if self.has_langfuse else '(tracing disabled, no crash)'}",
            ]
        )


settings = Settings()

__all__ = ["settings", "Settings", "MissingKeyError", "BACKEND_DIR", "REPO_ROOT"]


if __name__ == "__main__":  # `python -m app.config` = a config smoke test
    print(settings.capability_report())
    try:
        settings.require_llm_key()
        print("\nRequired keys present.")
    except MissingKeyError as exc:
        print(f"\n{exc}")
        raise SystemExit(1)
