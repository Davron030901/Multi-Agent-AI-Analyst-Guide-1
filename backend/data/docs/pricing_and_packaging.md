# Northwind Cloud — Pricing & Packaging (2026)

All prices are **per seat, per month, in USD**, billed monthly. A customer's MRR
is simply `monthly_price × seats`.

## Plans

| Plan | Price / seat / month | Seat limit | Intended segment |
|---|---|---|---|
| Starter | $19 | 10 | SMB, single team |
| Growth | $49 | 50 | SMB and small Mid-Market |
| Scale | $89 | 250 | Mid-Market |
| Enterprise | $149 | 2,000 | Enterprise |

## What each plan includes

**Starter — $19/seat.** Up to 10 seats. Unlimited workflows, 2,000 task runs per
month, generic REST connector, email support with a next-business-day target.
No SSO, no audit log, no sandbox environment.

**Growth — $49/seat.** Up to 50 seats. 25,000 task runs per month, the full
connector catalogue (excluding SAP and Workday, which are not yet built),
scheduled runs, basic role-based access, in-app chat support.

**Scale — $89/seat.** Up to 250 seats. 250,000 task runs per month, SSO
(SAML/OIDC), audit log, sandbox environment, one named Customer Success Manager,
P1 phone escalation.

**Enterprise — $149/seat.** Up to 2,000 seats. Unlimited task runs, everything in
Scale plus data residency selection, custom contractual SLAs with service
credits, a dedicated CSM and solutions architect, and quarterly business reviews.

## The 2026 price increase

Effective 1 January 2026, per-seat list prices rose across all four plans. The
increase applied to new contracts immediately and to existing customers at their
next renewal.

This change is the most frequently cited trigger in churn events tagged `PRICE`.
The impact is concentrated in SMB: a per-seat increase on a 9-seat Starter
account is a visible line-item change, while Enterprise customers absorb it
inside a negotiated multi-year agreement.

**Mitigation (approved Q2 2026):** SMB accounts renewing in the next 12 months
are grandfathered at their prior per-seat rate. This does not apply to seat
expansions, which are billed at current list.

## Billing mechanics

- Invoices are issued monthly on the subscription anniversary date.
- Invoice status is one of `paid`, `overdue`, or `failed`.
- `failed` means the payment method was declined; `overdue` means issued and
  unpaid past terms.
- Two or more consecutive `overdue` or `failed` invoices is a churn risk signal
  and triggers a Customer Success outreach play.
- Seats can be added mid-cycle and are prorated; seats can only be reduced at
  renewal.

## Discounting policy

- Up to 10%: CSM discretion.
- 10–20%: requires VP Sales approval.
- Above 20%: requires CFO approval and an annual prepay commitment.
- Multi-year prepay earns 15% (2-year) or 22% (3-year).
