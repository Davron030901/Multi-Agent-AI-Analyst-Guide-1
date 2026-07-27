"""LLM + embedding providers.

Three interchangeable backends, selected with ``LLM_PROVIDER``:

* ``gemini``   - the default. Free tier, no credit card. LLM **and** embeddings.
* ``openai``   - ``gpt-4o-mini`` + ``text-embedding-3-small``. Paid, but a single
  ``OPENAI_API_KEY`` covers both chat and embeddings.
* ``deepseek`` - chat only, via its OpenAI-compatible endpoint. It ships no
  embedding model, so it always pairs with Gemini or OpenAI for vectors.

Everything is constructed lazily and cached, so importing this module never
requires a key - only *calling* it does. That is what lets the offline test
suite import the whole package with an empty ``.env``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel

from .config import settings


@lru_cache(maxsize=4)
def get_llm(temperature: float | None = None) -> BaseChatModel:
    """Return the configured chat model.

    Cached per-temperature so the graph reuses one client across all agents.
    """
    settings.require_llm_key()
    temp = settings.llm_temperature if temperature is None else temperature

    if settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI

        kwargs: dict = {
            "model": settings.openai_model,
            "api_key": settings.openai_api_key,
            "temperature": temp,
            "timeout": 90,
            "max_retries": 2,
        }
        if settings.openai_base_url:  # proxy / compatible gateway
            kwargs["base_url"] = settings.openai_base_url
        return ChatOpenAI(**kwargs)

    if settings.llm_provider == "deepseek":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.deepseek_model,
            api_key=settings.deepseek_api_key,
            base_url="https://api.deepseek.com/v1",
            temperature=temp,
            timeout=90,
            max_retries=2,
        )

    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.google_api_key,
        temperature=temp,
        timeout=90,
        max_retries=2,
    )


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    """Embeddings from whichever backend ``settings.embed_provider`` resolves to.

    Both supported models are Matryoshka-truncatable to ``EMBED_DIM``:
    ``gemini-embedding-001`` via ``output_dimensionality`` and
    ``text-embedding-3-small`` via ``dimensions``. Older client versions may not
    expose those kwargs, so each is tried and then dropped rather than hard
    failing - the true dimension is probed at collection-creation time anyway
    (see ``vectorstore.probe_dimension``).

    IMPORTANT: changing the embedding provider or EMBED_DIM changes the vector
    dimension, which invalidates an existing collection. Re-ingest after either:
    ``python -m ingestion.ingest --reset``.
    """
    if settings.embed_provider == "openai":
        if not settings.has_openai:
            raise RuntimeError(
                "Embeddings resolve to OpenAI but OPENAI_API_KEY is not set.\n"
                "Set OPENAI_API_KEY, or force Gemini with EMBED_PROVIDER=gemini."
            )

        from langchain_openai import OpenAIEmbeddings

        kwargs: dict = {
            "model": settings.openai_embed_model,
            "api_key": settings.openai_api_key,
        }
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url

        try:
            return OpenAIEmbeddings(dimensions=settings.embed_dim, **kwargs)
        except TypeError:
            return OpenAIEmbeddings(**kwargs)

    # --- Gemini (default) --------------------------------------------------
    if not settings.has_gemini:
        raise RuntimeError(
            "Embeddings resolve to Gemini but GOOGLE_API_KEY is not set.\n"
            "Get a free key at https://aistudio.google.com/apikey, "
            "or set EMBED_PROVIDER=openai with an OPENAI_API_KEY."
        )

    from langchain_google_genai import GoogleGenerativeAIEmbeddings

    model = settings.gemini_embed_model
    if not model.startswith("models/"):
        model = f"models/{model}"

    try:
        return GoogleGenerativeAIEmbeddings(
            model=model,
            google_api_key=settings.google_api_key,
            output_dimensionality=settings.embed_dim,
        )
    except TypeError:
        return GoogleGenerativeAIEmbeddings(
            model=model,
            google_api_key=settings.google_api_key,
        )


def structured(schema: Any, temperature: float | None = None):
    """Helper: an LLM bound to a Pydantic output schema.

    Used by the supervisor (Route) and the critic (Verdict) so routing and
    verification are parsed values, not free text we have to regex.
    """
    return get_llm(temperature).with_structured_output(schema)


__all__ = ["get_llm", "get_embeddings", "structured"]
