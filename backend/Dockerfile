# syntax=docker/dockerfile:1
#
# Multi-Agent AI Analyst - backend image (F14).
#
# Multi-stage: the build stage carries the C toolchain needed to compile any
# wheel that has no prebuilt binary; the runtime stage carries none of it. That
# keeps the final image small enough to be comfortable on Render's free 512 MB
# instance.
#
# Build & run locally:
#   docker build -t analyst-api ./backend
#   docker run --rm -p 8000:8000 --env-file .env analyst-api
#
# Render: runtime "docker", dockerfilePath ./backend/Dockerfile (see render.yaml).

# ---------------------------------------------------------------------------
# Stage 1 - build the dependency tree into an isolated virtualenv
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# The venv is copied wholesale into the runtime stage, so nothing from the
# toolchain leaks into the final image.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build

# requirements.txt alone first: this layer is cached and only rebuilds when the
# dependency list actually changes, not on every source edit.
COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt


# ---------------------------------------------------------------------------
# Stage 2 - runtime
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8000

# curl is only here for the container HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app

# Unprivileged user. This matters more than usual here: the code agent (F6)
# spawns subprocesses, and running those as root would undo a layer of the
# sandbox.
RUN useradd --create-home --uid 10001 appuser

COPY --chown=appuser:appuser . .

RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /app/data /app/eval/results \
    && chown -R appuser:appuser /app

USER appuser

# Seed the SQLite database at build time. It is deterministic and needs no API
# key, so baking it in means the container is queryable the instant it boots.
RUN python -m ingestion.seed_db > /dev/null && echo "database seeded into the image"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
