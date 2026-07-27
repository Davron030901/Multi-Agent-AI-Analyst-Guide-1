"""F2 - Qdrant vector store (embedded by default, cloud optional).

The classic failure in this project is a dimension mismatch between the
embedding model and the Qdrant collection. We remove that failure mode entirely
by *probing* the live embedding model once and creating the collection to match,
instead of trusting a hardcoded number.

Embedded mode note: ``QdrantClient(path=...)`` takes an exclusive file lock, so
only one process may hold it at a time. Run the API or the eval harness, not
both. Set QDRANT_URL to use cloud mode and lift that restriction.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import List, Optional

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from .config import settings
from .llm import get_embeddings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_client():
    """One Qdrant client for the whole process (the file lock demands it)."""
    from qdrant_client import QdrantClient

    if settings.uses_qdrant_cloud:
        logger.info("Qdrant: cloud mode -> %s", settings.qdrant_url)
        return QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)

    path = settings.qdrant_dir
    path.mkdir(parents=True, exist_ok=True)
    logger.info("Qdrant: embedded mode -> %s", path)
    return QdrantClient(path=str(path))


def probe_dimension(embeddings: Optional[Embeddings] = None) -> int:
    """Embed one short string to learn the model's true output dimension."""
    emb = embeddings or get_embeddings()
    vector = emb.embed_query("dimension probe")
    return len(vector)


def ensure_collection(name: str, embeddings: Optional[Embeddings] = None) -> int:
    """Create ``name`` if absent, sized to the real embedding dimension.

    Returns the dimension in use. If the collection exists with a *different*
    size, we raise with the exact command to fix it rather than silently
    writing vectors that can never be searched.
    """
    from qdrant_client.http.models import Distance, VectorParams

    client = get_client()
    dim = probe_dimension(embeddings)

    if client.collection_exists(name):
        info = client.get_collection(name)
        existing = info.config.params.vectors.size  # type: ignore[union-attr]
        if existing != dim:
            raise RuntimeError(
                f"Collection '{name}' has dimension {existing} but the embedding model "
                f"'{settings.gemini_embed_model}' (EMBED_DIM={settings.embed_dim}) produces {dim}.\n"
                f"Fix: delete the collection and re-ingest ->\n"
                f"  python -m ingestion.ingest --reset"
            )
        return dim

    client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
    )
    logger.info("Created Qdrant collection '%s' (dim=%d, cosine)", name, dim)
    return dim


def get_vectorstore(collection: Optional[str] = None):
    """A LangChain vector store bound to ``collection`` (docs by default)."""
    from langchain_qdrant import QdrantVectorStore

    name = collection or settings.qdrant_collection
    embeddings = get_embeddings()
    ensure_collection(name, embeddings)

    return QdrantVectorStore(
        client=get_client(),
        collection_name=name,
        embedding=embeddings,
    )


def reset_collection(name: Optional[str] = None) -> None:
    """Drop a collection so ingestion can start clean."""
    client = get_client()
    target = name or settings.qdrant_collection
    if client.collection_exists(target):
        client.delete_collection(target)
        logger.info("Deleted collection '%s'", target)


def add_documents(docs: List[Document], collection: Optional[str] = None) -> int:
    store = get_vectorstore(collection)
    store.add_documents(docs)
    return len(docs)


def similarity_search(query: str, k: int = 4, collection: Optional[str] = None):
    return get_vectorstore(collection).similarity_search(query, k=k)


def count(collection: Optional[str] = None) -> int:
    client = get_client()
    name = collection or settings.qdrant_collection
    if not client.collection_exists(name):
        return 0
    return client.count(name, exact=True).count


__all__ = [
    "get_client",
    "get_vectorstore",
    "ensure_collection",
    "probe_dimension",
    "reset_collection",
    "add_documents",
    "similarity_search",
    "count",
]
