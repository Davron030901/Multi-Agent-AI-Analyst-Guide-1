# Northwind Cloud — Customer Success Playbook

## Health score

Every account carries a 0–100 health score, recomputed nightly from four inputs:

| Input | Weight | What "good" looks like |
|---|---|---|
| Activation — live workflows | 40% | 3+ workflows live by day 90 |
| Engagement — weekly active seats / total seats | 25% | above 60% |
| Support signal — 30-day ticket volume, P1 breaches, CSAT | 25% | fewer than 5 tickets, no breaches, CSAT ≥ 4 |
| Billing signal — consecutive overdue/failed invoices | 10% | zero |

Bands: **Green** 70–100 · **Yellow** 40–69 · **Red** below 40.

A Red account triggers a save play within one business day. A Yellow account is
reviewed at the weekly CS standup.

## Activation is the whole game

An account that reaches **3 live workflows within 90 days** is dramatically more
likely to renew. An account that does not is our most preventable loss and is
tagged `ONBOARDING_FAILURE` when it leaves. The milestones are:

- **Day 7** — kickoff call complete, first workflow built (may be a template).
- **Day 30** — first workflow live in production, second in build.
- **Day 60** — two workflows live, at least 30% of seats weekly active.
- **Day 90** — three workflows live. This is the activation bar.

From Q3 2026 the day-30 review is **mandatory for every new SMB account**, not
just those flagged at risk.

## Save plays

### Play 1 — Price objection (`PRICE`)
Trigger: the customer cites cost at renewal, or asks for a downgrade.
1. Confirm eligibility for the SMB grandfathering programme (prior per-seat rate
   held for 12 months) before offering any discount.
2. Right-size seats — most price objections are really unused-seat objections.
   Pull weekly active seats and offer to reduce the seat count at renewal.
3. Offer annual or multi-year prepay in exchange for the prepay discount.
4. Only then escalate for a discretionary discount, within the approval limits in
   `pricing_and_packaging.md`.

### Play 2 — Capability gap (`MISSING_FEATURE`)
Trigger: the customer names a capability we do not ship.
1. Confirm the gap against the roadmap. If it is committed, share the target
   quarter — do not invent a date.
2. If it is a connector gap, scope the generic REST workaround honestly,
   including who staffs the middleware.
3. Offer design-partner status: early access, direct PM contact, and influence
   on scope in exchange for staying through the release.
4. If the gap is on the "not planned" list, say so plainly. A clean exit protects
   a future return; a vague promise does not.

### Play 3 — Support quality (`POOR_SUPPORT`)
Trigger: any P1 resolution breach, or a CSAT of 1–2.
1. Executive apology within one business day, from a director or above.
2. Named Tier 2 engineer assigned to the account for 30 days.
3. Weekly check-in for 4 weeks, then reassess the health score.
4. For Enterprise, proactively calculate and offer any service credits owed
   rather than waiting for a request.

### Play 4 — Stalled activation (`ONBOARDING_FAILURE`)
Trigger: fewer than 2 live workflows at day 60.
1. Rebook the kickoff. The usual root cause is that the original champion moved
   on and nobody inherited the project.
2. Offer a built-for-you first workflow — a solutions engineer builds it live on
   a call.
3. Identify and train a second internal champion so the account does not depend
   on one person.

## Escalation ladder

CSM → CS Manager → VP Customer Success → COO.
Any Red Enterprise account is reported to the COO the same week.
