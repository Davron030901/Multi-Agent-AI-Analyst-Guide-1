#!/usr/bin/env sh
# Container entrypoint.
#
# Two jobs the Dockerfile cannot do on its own:
#   1. Honour $PORT at RUNTIME. Render assigns the port when the container
#      starts, not when it is built, so this cannot be baked into CMD.
#   2. Optionally ingest the document corpus on first boot, because embedding
#      needs an API key that is only present at runtime - never at build time.

set -e

PORT="${PORT:-8000}"

echo "-------------------------------------------------------------"
echo " Multi-Agent AI Analyst - backend container"
echo " provider : ${LLM_PROVIDER:-gemini}"
echo " port     : ${PORT}"
echo " qdrant   : ${QDRANT_URL:-embedded (${QDRANT_PATH:-./data/qdrant})}"
echo "-------------------------------------------------------------"

# --- database -------------------------------------------------------------
# Baked in at build time; this only matters if SQLITE_PATH points somewhere else.
DB_PATH="${SQLITE_PATH:-./data/company.db}"
if [ ! -f "$DB_PATH" ]; then
    echo "[entrypoint] seeding database at ${DB_PATH}..."
    python -m ingestion.seed_db || echo "[entrypoint] WARNING: seed failed, /health will report database=false"
fi

# --- vector store ---------------------------------------------------------
# Set AUTO_INGEST=true to embed the corpus on boot. Off by default: on Qdrant
# Cloud the collection persists across deploys, so re-ingesting every restart
# just burns API quota and duplicates vectors.
if [ "${AUTO_INGEST}" = "true" ]; then
    echo "[entrypoint] AUTO_INGEST=true - ingesting documents..."
    python -m ingestion.ingest --reset || echo "[entrypoint] WARNING: ingestion failed, the retriever will return nothing"
fi

# exec: uvicorn becomes PID 1, so SIGTERM reaches it directly and the container
# shuts down cleanly instead of being killed after a timeout.
exec uvicorn app.api:app \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers "${WEB_CONCURRENCY:-1}" \
    --timeout-keep-alive 65 \
    --proxy-headers
