# Northwind Cloud — Q2 2026 Churn Postmortem

**Prepared by:** Revenue Operations
**Period covered:** 1 April 2026 – 30 June 2026
**Distribution:** Leadership, Customer Success, Product

## 1. Purpose

This postmortem explains *why* customers left in Q2 2026. The counts and dollar
figures live in the production database (`churn_events`); this document is the
qualitative record behind each reason code. Read them together: the database
tells you how many, this document tells you why.

## 2. Reason code dictionary

Every churn event is tagged with exactly one reason code by the Customer Success
manager who ran the offboarding call. The codes are:

| Code | Meaning | Owner |
|---|---|---|
| `MISSING_FEATURE` | The customer needed a capability we do not ship and could not wait for it. | Product |
| `PRICE` | The customer left over cost — list price, a renewal increase, or a cheaper competitor. | Pricing |
| `POOR_SUPPORT` | Service quality drove the decision: SLA breaches, unanswered escalations, repeat P1s. | Support |
| `BUDGET_CUT` | The customer's budget was frozen or cut; not a product judgement. | — |
| `ONBOARDING_FAILURE` | The account never reached activation (fewer than 3 live workflows at day 90). | Customer Success |
| `MIGRATED_INHOUSE` | The customer built an internal replacement. | Product |
| `MERGER` | Acquired, and the acquirer standardised on a different vendor. | — |

## 3. What we saw in Q2 2026

**`MISSING_FEATURE` was the single largest driver of churn in the quarter, and by
a wide margin the largest driver of lost revenue.** The four accounts that left
for this reason were disproportionately large — they account for roughly three
quarters of all MRR lost in the quarter, even though they are a third of the
departures. Two specific gaps came up in every one of those offboarding calls:

1. **Native SAP and Workday connectors.** Customers in Manufacturing and
   Logistics need to pull master data directly. Our REST-based generic connector
   requires a middleware layer they must staff themselves. Two accounts named
   this as the sole blocker.
2. **Multi-step approval branching.** Our approval step is linear. Enterprise
   finance and procurement workflows need conditional branches (amount
   thresholds, delegated approvers, parallel sign-off). Customers built fragile
   workarounds with duplicated workflows and eventually gave up.

**`POOR_SUPPORT` was the second most common reason by count.** Every account
tagged `POOR_SUPPORT` had breached P1 targets in the 90 days before they left.
The pattern is not slow *first* response — it is slow escalation once the first
responder cannot solve the problem. See `support_sla_policy.md` for the targets
we committed to.

**`PRICE` remains the largest driver across the full history of the company**,
even though it was not the top reason in Q2 specifically. The 2026 per-seat list
price increase is the most-cited trigger; customers who churned on price were
overwhelmingly SMB accounts on Starter and Growth plans, where a per-seat
increase is felt immediately.

**`ONBOARDING_FAILURE` is our most preventable loss.** Accounts that fail to
reach three live workflows within 90 days churn at several times the rate of
activated accounts. This is entirely within our control and is the focus of the
save plays in `customer_success_playbook.md`.

## 4. Segment pattern

Churn is heavily concentrated in **SMB**, which accounts for the clear majority
of all departures in company history. Mid-Market is a distant second.
**Enterprise churn is effectively nil** — we have not lost an Enterprise-segment
account. Enterprise accounts do, however, generate the largest *revenue* impact
when they escalate, which is why `MISSING_FEATURE` dominates dollars lost while
`PRICE` dominates logo count.

## 5. Leading indicators we now watch

An account is flagged **at risk** if any of these are true:

- More than 5 support tickets in a rolling 30-day window.
- Any P1 ticket that breached its resolution target.
- A CSAT score of 1 or 2 on any ticket.
- Fewer than 3 live workflows at day 90 after signup.
- Two or more consecutive `overdue` or `failed` invoices.

## 6. Committed actions

| # | Action | Owner | Target |
|---|---|---|---|
| 1 | Ship native SAP and Workday connectors | Product | Q4 2026 |
| 2 | Ship conditional/branching approvals | Product | Q3 2026 |
| 3 | Enforce a hard escalation timer on P1s at 4h | Support | Q3 2026 |
| 4 | Grandfather SMB renewals at prior pricing for 12 months | Pricing | immediate |
| 5 | Mandatory day-30 activation review for every new SMB account | CS | Q3 2026 |
