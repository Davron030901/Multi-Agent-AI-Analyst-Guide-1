# Northwind Cloud — Product Roadmap H2 2026

**Status:** approved by the Product Council, 8 July 2026.
**Theme of the half:** close the enterprise capability gaps that are costing us
our largest accounts.

## Q3 2026 — committed

### Conditional / branching approvals
The single most requested capability in enterprise deals and the second-most
cited blocker in `MISSING_FEATURE` churn. Ships with:

- Conditional branches on amount thresholds and custom field values.
- Delegated approvers with out-of-office fallback.
- Parallel sign-off (N-of-M approval).
- Full audit trail of every branch taken.

Available on Scale and Enterprise plans.

### Hard P1 escalation timer
Support infrastructure, not customer-facing product. Any P1 ticket unresolved at
4 hours is automatically escalated to Tier 2 and pages the on-call engineer.
Directly addresses the escalation-latency problem named in the Q2 2026 churn
postmortem.

### Activation dashboard for Customer Success
Surfaces live workflow count per account against the day-30 / day-60 / day-90
activation milestones, so `ONBOARDING_FAILURE` is visible before it is terminal.

## Q4 2026 — committed

### Native SAP connector
Direct integration with SAP S/4HANA and ECC. Reads master data, purchase orders,
and vendor records without a customer-operated middleware layer. This is the
most-cited single blocker in `MISSING_FEATURE` churn events and was named by
Manufacturing and Logistics accounts specifically.

### Native Workday connector
Worker, organisation, and position data. Same rationale: today customers must
staff and run their own middleware, which puts the integration cost back on
them.

### Usage-based pricing option
An alternative to per-seat pricing, billed on task runs. Intended to defuse the
`PRICE` churn driver in SMB, where a per-seat increase lands hardest. Customers
may choose per-seat or usage-based at renewal, not both.

## 2027 — under consideration, not committed

- On-premise / VPC deployment for regulated Healthcare and Fintech customers.
- Workflow versioning with diff and rollback.
- A public workflow template marketplace.
- Native mobile approvals app.

## Explicitly not planned

- A visual form builder — customers should use their existing form tooling and
  trigger workflows by webhook.
- A general-purpose BI/reporting layer — we integrate with the customer's
  warehouse rather than competing with it.
