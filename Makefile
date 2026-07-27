# Multi-Agent AI Analyst - common tasks.
# Windows without make? Every recipe is a one-line command you can paste; the
# equivalents are listed in README.md under "Commands".

.PHONY: help install seed ingest test test-live smoke api ui eval eval-quick graph clean

BACKEND := backend
PY      := python

help:
	@echo "make install     - install backend deps"
	@echo "make seed        - build the SQLite database"
	@echo "make ingest      - chunk + embed the docs into Qdrant"
	@echo "make smoke       - end-to-end check of every feature"
	@echo "make test        - offline test suite (no API key needed)"
	@echo "make test-live   - live test suite (needs GOOGLE_API_KEY)"
	@echo "make api         - run the FastAPI backend on :8000"
	@echo "make ui          - run the Next.js frontend on :3000"
	@echo "make eval        - full evaluation, with and without the critic"
	@echo "make eval-quick  - 6-question evaluation (saves free-tier quota)"
	@echo "make graph       - print the graph as Mermaid"

install:
	cd $(BACKEND) && pip install -r requirements.txt

seed:
	cd $(BACKEND) && $(PY) -m ingestion.seed_db

ingest:
	cd $(BACKEND) && $(PY) -m ingestion.ingest --reset

test:
	cd $(BACKEND) && $(PY) -m pytest -q

test-live:
	cd $(BACKEND) && $(PY) -m pytest -m live -v

smoke:
	cd $(BACKEND) && $(PY) -m scripts.smoke

api:
	cd $(BACKEND) && uvicorn app.api:app --reload --port 8000

ui:
	cd frontend && npm run dev

eval:
	cd $(BACKEND) && $(PY) -m eval.run_eval

eval-quick:
	cd $(BACKEND) && $(PY) -m eval.run_eval --quick --no-ragas

graph:
	cd $(BACKEND) && $(PY) -c "import sys; sys.path.insert(0,'.'); from app.graph import mermaid_diagram; print(mermaid_diagram())"

clean:
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	rm -rf $(BACKEND)/data/qdrant $(BACKEND)/data/company.db $(BACKEND)/.pytest_cache
