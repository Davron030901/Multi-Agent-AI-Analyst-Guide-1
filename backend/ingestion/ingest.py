"""F2 - Ingestion: load -> chunk -> embed -> upsert into Qdrant.

Run:
    python -m ingestion.ingest                # ingest (creates collection if needed)
    python -m ingestion.ingest --reset        # drop the collection first
    python -m ingestion.ingest --query "why did customers churn?"   # sanity check

"Done when": a similarity search returns relevant chunks. The --query flag IS
that check, so the criterion is demonstrable with one command.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from langchain_core.documents import Document  # noqa: E402
from langchain_text_splitters import RecursiveCharacterTextSplitter  # noqa: E402

from app.config import BACKEND_DIR, settings  # noqa: E402
from app import vectorstore as vs  # noqa: E402

DOCS_DIR = BACKEND_DIR / "data" / "docs"
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


def load_documents(docs_dir: Path = DOCS_DIR) -> List[Document]:
    """Read every .md/.txt file in the corpus into a LangChain Document."""
    if not docs_dir.exists():
        raise FileNotFoundError(f"Document folder not found: {docs_dir}")

    paths = sorted([*docs_dir.glob("**/*.md"), *docs_dir.glob("**/*.txt")])
    if not paths:
        raise FileNotFoundError(f"No .md or .txt files in {docs_dir}")

    docs: List[Document] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        title = text.lstrip().split("\n", 1)[0].lstrip("# ").strip() or path.stem
        docs.append(
            Document(
                page_content=text,
                metadata={"source": path.name, "title": title, "path": str(path)},
            )
        )
    return docs


def chunk_documents(docs: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n## ", "\n### ", "\n\n", "\n", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    for i, chunk in enumerate(chunks):
        chunk.metadata["chunk_index"] = i
    return chunks


def ingest(reset: bool = False) -> int:
    if reset:
        vs.reset_collection(settings.qdrant_collection)
        print(f"Reset collection '{settings.qdrant_collection}'")

    docs = load_documents()
    print(f"Loaded {len(docs)} documents from {DOCS_DIR}")
    for d in docs:
        print(f"  - {d.metadata['source']:<38} {len(d.page_content):>6} chars")

    chunks = chunk_documents(docs)
    print(f"\nSplit into {len(chunks)} chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})")

    dim = vs.ensure_collection(settings.qdrant_collection)
    print(f"Collection '{settings.qdrant_collection}' ready (embedding dim = {dim})")

    vs.add_documents(chunks)
    total = vs.count(settings.qdrant_collection)
    print(f"Upserted. Collection now holds {total} vectors.")
    return len(chunks)


def sanity_query(question: str, k: int = 4) -> None:
    print(f"\n--- similarity search: {question!r} (top {k}) ---")
    hits = vs.similarity_search(question, k=k)
    if not hits:
        print("No results. Did you run ingestion first?")
        return
    for i, doc in enumerate(hits, 1):
        preview = " ".join(doc.page_content.split())[:280]
        print(f"\n[{i}] {doc.metadata.get('source', '?')}\n    {preview}...")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest the document corpus into Qdrant.")
    parser.add_argument("--reset", action="store_true", help="drop the collection before ingesting")
    parser.add_argument("--query", type=str, default=None, help="run a similarity search instead of ingesting")
    parser.add_argument("--k", type=int, default=4)
    args = parser.parse_args()

    settings.require_llm_key()

    if args.query:
        sanity_query(args.query, args.k)
        return

    ingest(reset=args.reset)
    # Always finish with a live sanity check so "Done when" is proven, not claimed.
    sanity_query("Why did customers churn in Q2 2026?", args.k)


if __name__ == "__main__":
    main()
