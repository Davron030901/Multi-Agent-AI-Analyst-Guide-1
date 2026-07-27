# Northwind Cloud — Support SLA Policy

Applies to all plans. Contractual service credits apply to Enterprise only.

## Priority definitions

**P1 — Critical.** Production is down or a business-critical workflow is failing
for all users of the account. Data loss or a security incident is always P1.

**P2 — Major.** A significant feature is broken or degraded, but a workaround
exists and the account is still operating.

**P3 — Minor.** Questions, how-to requests, cosmetic issues, feature requests,
and anything with no operational impact.

## Targets

| Priority | First response | Resolution target | Escalation timer |
|---|---|---|---|
| P1 | 1 hour, 24/7 | **8 hours** | 4 hours to Tier 2 + on-call engineer |
| P2 | 4 business hours | 2 business days | 1 business day to Tier 2 |
| P3 | 1 business day | 5 business days | none |

Resolution time is measured in wall-clock hours from ticket creation to
resolution and is recorded in `support_tickets.resolved_hours`.

## Ticket categories

`Bug`, `How-to`, `Integration`, `Billing`, `Outage`. Category is set by the
first responder and is used for product feedback routing, not for SLA
calculation — only `priority` drives SLA.

## Known problem: escalation, not first response

Our first-response times are healthy across all priorities. The failure mode
identified in the Q2 2026 churn postmortem is **escalation latency**: when a
Tier 1 responder cannot resolve a P1, the handoff to Tier 2 has historically
been informal and untimed. Tickets sit "in progress" while nobody with the
ability to fix them is looking.

Because of this, the **average P1 resolution time exceeds the 8-hour resolution
target**, even though first response is comfortably inside the 1-hour target.
Every account that churned with reason code `POOR_SUPPORT` had at least one P1
that breached the resolution target in the preceding 90 days.

**Committed fix (Q3 2026):** a hard, automated escalation timer. Any P1 not
resolved within 4 hours is auto-escalated to Tier 2 and pages the on-call
engineer. No human judgement required.

## CSAT

Customers may rate any resolved ticket 1–5. Rating is optional, so roughly a
fifth of tickets carry no score. A rating of 1 or 2 is treated as a churn risk
signal and generates a Customer Success task within one business day.

## Service credits (Enterprise only)

| Monthly uptime | Credit |
|---|---|
| < 99.9% | 10% of monthly fee |
| < 99.5% | 25% of monthly fee |
| < 99.0% | 50% of monthly fee |

Credits must be requested within 30 days of the incident and are applied to the
next invoice. Credits are not paid in cash.
