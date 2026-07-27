"""Seed the SQLite database the data agent (F5) queries.

Fictional B2B SaaS company: **Northwind Cloud**, a workflow-automation product.
The dataset is small but realistic, and - critically - it is *deterministic*
(`random.seed(RANDOM_SEED)`), so the evaluation harness can assert exact
reference answers.

Run:  python -m ingestion.seed_db
"""

from __future__ import annotations

import random
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402

RANDOM_SEED = 42
WORLD_START = date(2024, 1, 1)
WORLD_END = date(2026, 6, 30)  # dataset "today" - so Q2 2026 is the last full quarter

SCHEMA = """
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS churn_events;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
    customer_id   INTEGER PRIMARY KEY,
    company_name  TEXT    NOT NULL,
    industry      TEXT    NOT NULL,   -- Retail, Healthcare, Fintech, Logistics, Manufacturing, Education, Media
    country       TEXT    NOT NULL,
    segment       TEXT    NOT NULL,   -- SMB, Mid-Market, Enterprise
    employees     INTEGER NOT NULL,
    signup_date   TEXT    NOT NULL    -- ISO date
);

CREATE TABLE plans (
    plan_id       INTEGER PRIMARY KEY,
    plan_name     TEXT    NOT NULL,   -- Starter, Growth, Scale, Enterprise
    monthly_price REAL    NOT NULL,   -- price per seat, USD
    seat_limit    INTEGER NOT NULL
);

CREATE TABLE subscriptions (
    subscription_id INTEGER PRIMARY KEY,
    customer_id     INTEGER NOT NULL REFERENCES customers(customer_id),
    plan_id         INTEGER NOT NULL REFERENCES plans(plan_id),
    seats           INTEGER NOT NULL,
    mrr             REAL    NOT NULL, -- monthly recurring revenue, USD
    start_date      TEXT    NOT NULL,
    end_date        TEXT,             -- NULL while active
    status          TEXT    NOT NULL  -- active | churned
);

CREATE TABLE invoices (
    invoice_id      INTEGER PRIMARY KEY,
    customer_id     INTEGER NOT NULL REFERENCES customers(customer_id),
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(subscription_id),
    issue_date      TEXT    NOT NULL,
    amount          REAL    NOT NULL,
    status          TEXT    NOT NULL  -- paid | overdue | failed
);

CREATE TABLE churn_events (
    churn_id     INTEGER PRIMARY KEY,
    customer_id  INTEGER NOT NULL REFERENCES customers(customer_id),
    churn_date   TEXT    NOT NULL,
    reason_code  TEXT    NOT NULL,   -- see docs/churn_postmortem_q2_2026.md
    mrr_lost     REAL    NOT NULL,
    notes        TEXT
);

CREATE TABLE support_tickets (
    ticket_id      INTEGER PRIMARY KEY,
    customer_id    INTEGER NOT NULL REFERENCES customers(customer_id),
    created_date   TEXT    NOT NULL,
    category       TEXT    NOT NULL,  -- Bug, How-to, Integration, Billing, Outage
    priority       TEXT    NOT NULL,  -- P1, P2, P3
    resolved_hours REAL,
    csat           INTEGER            -- 1-5, NULL if not rated
);

CREATE INDEX idx_sub_customer   ON subscriptions(customer_id);
CREATE INDEX idx_churn_date     ON churn_events(churn_date);
CREATE INDEX idx_ticket_customer ON support_tickets(customer_id);
"""

INDUSTRIES = ["Retail", "Healthcare", "Fintech", "Logistics", "Manufacturing", "Education", "Media"]
COUNTRIES = ["United States", "United Kingdom", "Germany", "Canada", "Australia", "Netherlands", "Uzbekistan", "India"]
SEGMENTS = ["SMB", "Mid-Market", "Enterprise"]

PLANS = [
    (1, "Starter", 19.0, 10),
    (2, "Growth", 49.0, 50),
    (3, "Scale", 89.0, 250),
    (4, "Enterprise", 149.0, 2000),
]

# Reason codes, weighted. These weights are what make "why did they churn?"
# have a real, document-explainable answer.
REASON_CODES = [
    ("MISSING_FEATURE", 26),
    ("PRICE", 22),
    ("POOR_SUPPORT", 16),
    ("BUDGET_CUT", 13),
    ("ONBOARDING_FAILURE", 11),
    ("MIGRATED_INHOUSE", 7),
    ("MERGER", 5),
]

REASON_NOTES = {
    "MISSING_FEATURE": "Blocked on native SAP/Workday connectors and multi-step approval branching.",
    "PRICE": "Moved to a cheaper competitor after the 2026 per-seat list price increase.",
    "POOR_SUPPORT": "Repeated P1 breaches; escalations were not answered inside the SLA window.",
    "BUDGET_CUT": "Department-wide software budget freeze; tool consolidation.",
    "ONBOARDING_FAILURE": "Never reached activation - fewer than 3 workflows live after 90 days.",
    "MIGRATED_INHOUSE": "Built an internal replacement on top of their own data platform.",
    "MERGER": "Acquired; standardised on the acquirer's existing vendor.",
}

COMPANY_PREFIX = [
    "Apex", "Northwind", "Bluepeak", "Cedar", "Delta", "Evergreen", "Falcon", "Granite",
    "Harbor", "Ironwood", "Juniper", "Kestrel", "Lumen", "Meridian", "Nimbus", "Orchard",
    "Pinnacle", "Quarry", "Ridgeline", "Summit", "Tidewater", "Umbra", "Vertex", "Wavelength",
    "Xenon", "Yarrow", "Zephyr", "Anchor", "Basalt", "Copper", "Dune", "Ember",
]
COMPANY_SUFFIX = ["Labs", "Systems", "Group", "Industries", "Health", "Logistics", "Partners", "Digital", "Works", "Analytics"]
TICKET_CATEGORIES = ["Bug", "How-to", "Integration", "Billing", "Outage"]


def _rand_date(rng: random.Random, start: date, end: date) -> date:
    return start + timedelta(days=rng.randint(0, (end - start).days))


def _weighted_choice(rng: random.Random, weighted: list[tuple[str, int]]) -> str:
    total = sum(w for _, w in weighted)
    roll = rng.uniform(0, total)
    upto = 0.0
    for value, weight in weighted:
        upto += weight
        if roll <= upto:
            return value
    return weighted[-1][0]


def build(conn: sqlite3.Connection) -> dict:
    rng = random.Random(RANDOM_SEED)
    conn.executescript(SCHEMA)

    conn.executemany("INSERT INTO plans VALUES (?,?,?,?)", PLANS)
    plan_by_id = {p[0]: p for p in PLANS}

    # ---- customers ---------------------------------------------------------
    n_customers = 180
    used_names: set[str] = set()
    customers = []
    for cid in range(1, n_customers + 1):
        while True:
            name = f"{rng.choice(COMPANY_PREFIX)} {rng.choice(COMPANY_SUFFIX)}"
            if name not in used_names:
                used_names.add(name)
                break
        segment = rng.choices(SEGMENTS, weights=[52, 33, 15])[0]
        employees = {
            "SMB": rng.randint(8, 90),
            "Mid-Market": rng.randint(120, 900),
            "Enterprise": rng.randint(1200, 14000),
        }[segment]
        signup = _rand_date(rng, WORLD_START, WORLD_END - timedelta(days=45))
        customers.append(
            (cid, name, rng.choice(INDUSTRIES), rng.choice(COUNTRIES), segment, employees, signup.isoformat())
        )
    conn.executemany("INSERT INTO customers VALUES (?,?,?,?,?,?,?)", customers)

    # ---- subscriptions -----------------------------------------------------
    subs = []
    churns = []
    invoices = []
    sub_id = 0
    churn_id = 0
    invoice_id = 0

    for cid, _name, _ind, _country, segment, _emp, signup_iso in customers:
        signup = date.fromisoformat(signup_iso)
        plan_id = {
            "SMB": rng.choices([1, 2], weights=[60, 40])[0],
            "Mid-Market": rng.choices([2, 3], weights=[45, 55])[0],
            "Enterprise": rng.choices([3, 4], weights=[30, 70])[0],
        }[segment]
        _, _plan_name, price, seat_limit = plan_by_id[plan_id]
        seats = min(seat_limit, max(3, int(rng.gauss({"SMB": 9, "Mid-Market": 42, "Enterprise": 210}[segment], 6))))
        mrr = round(price * seats, 2)

        # Churn probability is higher for SMB and for very young accounts.
        base_churn = {"SMB": 0.30, "Mid-Market": 0.19, "Enterprise": 0.11}[segment]
        churned = rng.random() < base_churn and (WORLD_END - signup).days > 60

        end_iso = None
        status = "active"
        if churned:
            earliest = signup + timedelta(days=45)
            churn_day = _rand_date(rng, earliest, WORLD_END)
            end_iso = churn_day.isoformat()
            status = "churned"
            churn_id += 1
            reason = _weighted_choice(rng, REASON_CODES)
            churns.append((churn_id, cid, end_iso, reason, mrr, REASON_NOTES[reason]))

        sub_id += 1
        subs.append((sub_id, cid, plan_id, seats, mrr, signup_iso, end_iso, status))

        # ---- invoices: monthly from signup until churn/now -----------------
        cursor_date = signup
        stop = date.fromisoformat(end_iso) if end_iso else WORLD_END
        while cursor_date <= stop:
            invoice_id += 1
            roll = rng.random()
            inv_status = "paid" if roll < 0.90 else ("overdue" if roll < 0.97 else "failed")
            invoices.append((invoice_id, cid, sub_id, cursor_date.isoformat(), mrr, inv_status))
            # advance ~1 month
            month = cursor_date.month + 1
            year = cursor_date.year + (month - 1) // 12
            month = (month - 1) % 12 + 1
            day = min(cursor_date.day, 28)
            cursor_date = date(year, month, day)

    conn.executemany("INSERT INTO subscriptions VALUES (?,?,?,?,?,?,?,?)", subs)
    conn.executemany("INSERT INTO churn_events VALUES (?,?,?,?,?,?)", churns)
    conn.executemany("INSERT INTO invoices VALUES (?,?,?,?,?,?)", invoices)

    # ---- support tickets ---------------------------------------------------
    tickets = []
    ticket_id = 0
    churned_ids = {c[1] for c in churns}
    for cid, *_rest in customers:
        # churned customers filed noticeably more tickets - the "why" signal
        n_tickets = rng.randint(4, 14) if cid in churned_ids else rng.randint(0, 8)
        for _ in range(n_tickets):
            ticket_id += 1
            created = _rand_date(rng, WORLD_START, WORLD_END)
            priority = rng.choices(["P1", "P2", "P3"], weights=[15, 35, 50])[0]
            resolved = round(abs(rng.gauss({"P1": 9, "P2": 26, "P3": 55}[priority], 8)), 1)
            csat = rng.choices([None, 1, 2, 3, 4, 5], weights=[20, 8, 10, 18, 26, 18])[0]
            tickets.append(
                (ticket_id, cid, created.isoformat(), rng.choice(TICKET_CATEGORIES), priority, resolved, csat)
            )
    conn.executemany("INSERT INTO support_tickets VALUES (?,?,?,?,?,?,?)", tickets)

    conn.commit()
    return {
        "customers": len(customers),
        "subscriptions": len(subs),
        "churn_events": len(churns),
        "invoices": len(invoices),
        "support_tickets": len(tickets),
    }


def summarise(conn: sqlite3.Connection) -> None:
    """Print the facts the eval test set asserts against."""
    q = lambda sql: conn.execute(sql).fetchall()  # noqa: E731

    print("\n--- key facts (use these as evaluation reference answers) ---")
    print("Q2 2026 churn count:      ",
          q("SELECT COUNT(*) FROM churn_events WHERE churn_date BETWEEN '2026-04-01' AND '2026-06-30'")[0][0])
    print("Q2 2026 MRR lost:          $",
          round(q("SELECT COALESCE(SUM(mrr_lost),0) FROM churn_events WHERE churn_date BETWEEN '2026-04-01' AND '2026-06-30'")[0][0], 2))
    print("Q1 2026 churn count:      ",
          q("SELECT COUNT(*) FROM churn_events WHERE churn_date BETWEEN '2026-01-01' AND '2026-03-31'")[0][0])
    print("Total churned customers:  ", q("SELECT COUNT(*) FROM churn_events")[0][0])
    print("Active customers:         ", q("SELECT COUNT(*) FROM subscriptions WHERE status='active'")[0][0])
    print("Total active MRR:          $",
          round(q("SELECT SUM(mrr) FROM subscriptions WHERE status='active'")[0][0], 2))

    print("\nQ2 2026 churn reasons:")
    for reason, n, lost in q(
        "SELECT reason_code, COUNT(*), ROUND(SUM(mrr_lost),2) FROM churn_events "
        "WHERE churn_date BETWEEN '2026-04-01' AND '2026-06-30' "
        "GROUP BY reason_code ORDER BY COUNT(*) DESC, reason_code"
    ):
        print(f"  {reason:<20} {n:>3}   ${lost}")

    print("\nAll-time churn reasons:")
    for reason, n in q(
        "SELECT reason_code, COUNT(*) FROM churn_events GROUP BY reason_code ORDER BY COUNT(*) DESC, reason_code"
    ):
        print(f"  {reason:<20} {n:>3}")

    print("\nChurn by segment (all time):")
    for seg, n in q(
        "SELECT c.segment, COUNT(*) FROM churn_events e JOIN customers c USING(customer_id) "
        "GROUP BY c.segment ORDER BY COUNT(*) DESC"
    ):
        print(f"  {seg:<12} {n:>3}")

    print("\nAvg P1 resolution hours: ",
          round(q("SELECT AVG(resolved_hours) FROM support_tickets WHERE priority='P1'")[0][0], 2))
    print("Avg CSAT (rated):        ",
          round(q("SELECT AVG(csat) FROM support_tickets WHERE csat IS NOT NULL")[0][0], 3))
    print("Overdue+failed invoices: ",
          q("SELECT COUNT(*) FROM invoices WHERE status IN ('overdue','failed')")[0][0])


def main() -> None:
    db_path = settings.db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    try:
        counts = build(conn)
        print(f"Seeded {db_path}")
        for table, n in counts.items():
            print(f"  {table:<18} {n:>6} rows")
        summarise(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
