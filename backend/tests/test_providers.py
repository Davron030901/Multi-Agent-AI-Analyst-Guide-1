"""Provider selection: gemini / openai / deepseek, and embedding resolution.

Offline. ``Settings`` reads the environment through ``default_factory``, so
constructing a fresh instance after ``monkeypatch.setenv`` gives a clean,
isolated configuration per test - no global state to reset.

The subtle rule these tests pin down: **the chat provider and the embedding
provider are not always the same one.** DeepSeek has no embedding endpoint, so
it must always borrow Gemini's or OpenAI's.
"""

from __future__ import annotations

import pytest

from app.config import MissingKeyError, Settings

ENV_KEYS = [
    "LLM_PROVIDER", "EMBED_PROVIDER", "EMBED_DIM",
    "GOOGLE_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY",
    "GEMINI_MODEL", "OPENAI_MODEL", "OPENAI_EMBED_MODEL", "DEEPSEEK_MODEL",
    "OPENAI_BASE_URL",
]


@pytest.fixture
def make_settings(monkeypatch: pytest.MonkeyPatch):
    """Build a Settings from an explicit env, ignoring the developer's real .env."""

    def _factory(**env: str) -> Settings:
        for key in ENV_KEYS:
            monkeypatch.delenv(key, raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        return Settings()

    return _factory


class TestChatProvider:
    def test_gemini_is_the_default(self, make_settings) -> None:
        s = make_settings(GOOGLE_API_KEY="g-key")
        assert s.llm_provider == "gemini"
        assert s.chat_model == "gemini-2.5-flash"
        assert s.llm_key_present

    def test_openai_selected(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="openai", OPENAI_API_KEY="sk-test")
        assert s.chat_model == "gpt-4o-mini"
        assert s.llm_key_present
        assert s.has_openai

    def test_openai_model_override(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="openai", OPENAI_API_KEY="sk-test", OPENAI_MODEL="gpt-4o")
        assert s.chat_model == "gpt-4o"

    def test_deepseek_selected(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="deepseek", DEEPSEEK_API_KEY="ds-key", GOOGLE_API_KEY="g")
        assert s.chat_model == "deepseek-chat"

    def test_provider_is_case_insensitive(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="OpenAI", OPENAI_API_KEY="sk-test")
        assert s.llm_provider == "openai"


class TestEmbeddingResolution:
    def test_openai_chat_uses_openai_embeddings(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="openai", OPENAI_API_KEY="sk-test")
        assert s.embed_provider == "openai"
        assert s.embed_model == "text-embedding-3-small"

    def test_gemini_chat_uses_gemini_embeddings(self, make_settings) -> None:
        s = make_settings(GOOGLE_API_KEY="g-key")
        assert s.embed_provider == "gemini"
        assert s.embed_model == "models/gemini-embedding-001"

    def test_deepseek_borrows_gemini_embeddings(self, make_settings) -> None:
        """DeepSeek has no embedding endpoint - it must fall back."""
        s = make_settings(LLM_PROVIDER="deepseek", DEEPSEEK_API_KEY="ds", GOOGLE_API_KEY="g")
        assert s.embed_provider == "gemini"

    def test_deepseek_borrows_openai_when_gemini_absent(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="deepseek", DEEPSEEK_API_KEY="ds", OPENAI_API_KEY="sk")
        assert s.embed_provider == "openai"

    def test_explicit_override_wins(self, make_settings) -> None:
        """OpenAI chat + free Gemini vectors is a deliberate, supported mix."""
        s = make_settings(
            LLM_PROVIDER="openai", OPENAI_API_KEY="sk", GOOGLE_API_KEY="g",
            EMBED_PROVIDER="gemini",
        )
        assert s.chat_model == "gpt-4o-mini"
        assert s.embed_provider == "gemini"

    def test_dimension_is_shared_across_providers(self, make_settings) -> None:
        for env in ({"GOOGLE_API_KEY": "g"}, {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk"}):
            assert make_settings(EMBED_DIM="1024", **env).embed_dim == 1024


class TestKeyValidation:
    def test_openai_without_key_fails_clearly(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="openai")
        with pytest.raises(MissingKeyError, match="OPENAI_API_KEY"):
            s.require_llm_key()

    def test_gemini_without_key_fails_clearly(self, make_settings) -> None:
        s = make_settings()
        with pytest.raises(MissingKeyError, match="GOOGLE_API_KEY"):
            s.require_llm_key()

    def test_deepseek_without_key_fails_clearly(self, make_settings) -> None:
        s = make_settings(LLM_PROVIDER="deepseek")
        with pytest.raises(MissingKeyError, match="DEEPSEEK_API_KEY"):
            s.require_llm_key()

    def test_deepseek_alone_fails_on_embeddings(self, make_settings) -> None:
        """The chat key alone is not enough - this is the easy mistake to make."""
        s = make_settings(LLM_PROVIDER="deepseek", DEEPSEEK_API_KEY="ds")
        with pytest.raises(MissingKeyError, match="[Ee]mbedding"):
            s.require_llm_key()

    def test_forced_openai_embeddings_without_key_fails(self, make_settings) -> None:
        s = make_settings(GOOGLE_API_KEY="g", EMBED_PROVIDER="openai")
        with pytest.raises(MissingKeyError, match="OPENAI_API_KEY"):
            s.require_llm_key()

    @pytest.mark.parametrize(
        "env",
        [
            {"GOOGLE_API_KEY": "g"},
            {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk"},
            {"LLM_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "ds", "GOOGLE_API_KEY": "g"},
            {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk", "GOOGLE_API_KEY": "g",
             "EMBED_PROVIDER": "gemini"},
        ],
    )
    def test_valid_combinations_pass(self, make_settings, env: dict) -> None:
        make_settings(**env).require_llm_key()  # must not raise


class TestCapabilityReport:
    def test_names_both_providers(self, make_settings) -> None:
        report = make_settings(LLM_PROVIDER="openai", OPENAI_API_KEY="sk").capability_report()
        assert "openai" in report
        assert "gpt-4o-mini" in report
        assert "text-embedding-3-small" in report

    def test_marks_a_missing_key_off(self, make_settings) -> None:
        report = make_settings(LLM_PROVIDER="openai").capability_report()
        assert "[off]" in report
