"""CORS allowlist behaviour.

Deployment-critical and invisible until it breaks: the API works perfectly from
curl and fails from the browser, which sends people hunting in the wrong place.
Vercel makes it worse by minting a fresh hostname
(``project-<hash>.vercel.app``) for every single deployment, so an exact-match
allowlist silently stops working on the next push.

``CORS_ORIGIN_REGEX`` fixes that. These tests pin down that it accepts your own
preview URLs and still blocks everyone else's.

Implementation note: we test ``cors_kwargs()`` against a throwaway app rather
than reloading ``app.api``. Reloading would rebind ``MissingKeyError`` to a new
class object and break ``pytest.raises`` identity checks in other test modules.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.api import cors_kwargs
from app.config import Settings

PROJECT_REGEX = r"https://myproject-abc.*\.vercel\.app"


def _client(monkeypatch: pytest.MonkeyPatch, origins: str, regex: str = "") -> TestClient:
    """A minimal app carrying exactly the CORS config under test."""
    monkeypatch.setenv("CORS_ORIGINS", origins)
    monkeypatch.setenv("CORS_ORIGIN_REGEX", regex)

    app = FastAPI()
    app.add_middleware(CORSMiddleware, **cors_kwargs(Settings()))

    @app.post("/ask/stream")
    def _stream() -> dict:  # pragma: no cover - only the preflight is exercised
        return {"ok": True}

    return TestClient(app)


def _preflight_allowed(client: TestClient, origin: str) -> bool:
    response = client.options(
        "/ask/stream",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    return "access-control-allow-origin" in {k.lower() for k in response.headers}


class TestExactAllowlist:
    def test_listed_origin_allowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _client(monkeypatch, "http://localhost:3000,https://myapp.vercel.app")
        assert _preflight_allowed(client, "https://myapp.vercel.app")
        assert _preflight_allowed(client, "http://localhost:3000")

    def test_unlisted_origin_blocked(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _client(monkeypatch, "https://myapp.vercel.app")
        assert not _preflight_allowed(client, "https://evil.com")

    def test_whitespace_around_commas_is_tolerated(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _client(monkeypatch, " http://localhost:3000 , https://myapp.vercel.app ")
        assert _preflight_allowed(client, "https://myapp.vercel.app")

    def test_trailing_slash_does_not_match(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Browsers send Origin without a trailing slash - so a slash breaks it.

        The single most common CORS misconfiguration, pinned here as documented
        behaviour rather than left as a surprise at 1am.
        """
        client = _client(monkeypatch, "https://myapp.vercel.app/")
        assert not _preflight_allowed(client, "https://myapp.vercel.app")


class TestRegexAllowlist:
    def test_stable_production_domain_allowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _client(monkeypatch, "http://localhost:3000", PROJECT_REGEX)
        assert _preflight_allowed(client, "https://myproject-abc.vercel.app")

    @pytest.mark.parametrize(
        "host",
        [
            "https://myproject-abc-h1t7b5hvj.vercel.app",
            "https://myproject-abc-9zzq11kk.vercel.app",
            "https://myproject-abc-git-main-user.vercel.app",
        ],
    )
    def test_any_deployment_hash_allowed(self, monkeypatch: pytest.MonkeyPatch, host: str) -> None:
        """The whole point: a new hash on every push must keep working."""
        client = _client(monkeypatch, "http://localhost:3000", PROJECT_REGEX)
        assert _preflight_allowed(client, host)

    def test_someone_elses_vercel_app_still_blocked(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Scoped to the project prefix - not a blanket *.vercel.app opening."""
        client = _client(monkeypatch, "http://localhost:3000", PROJECT_REGEX)
        assert not _preflight_allowed(client, "https://someone-else.vercel.app")
        assert not _preflight_allowed(client, "https://evil.com")

    def test_exact_list_still_applies_alongside_regex(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _client(monkeypatch, "http://localhost:3000", PROJECT_REGEX)
        assert _preflight_allowed(client, "http://localhost:3000")


class TestConfigShape:
    def test_regex_omitted_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
        monkeypatch.delenv("CORS_ORIGIN_REGEX", raising=False)
        assert "allow_origin_regex" not in cors_kwargs(Settings())

    def test_credentials_never_enabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """allow_credentials=True with a regex origin would be a real hole."""
        monkeypatch.setenv("CORS_ORIGIN_REGEX", PROJECT_REGEX)
        assert cors_kwargs(Settings())["allow_credentials"] is False
