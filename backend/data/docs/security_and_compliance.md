# Northwind Cloud — Security & Compliance Overview

Last reviewed: June 2026.

## Certifications and attestations

- **SOC 2 Type II** — current, audited annually, report available under NDA.
- **ISO/IEC 27001** — certified.
- **GDPR** — compliant. A Data Processing Addendum is available for all plans and
  is signed by default for EU customers.
- **HIPAA** — a Business Associate Agreement is available on Enterprise only.
- **PCI DSS** — out of scope. We never store cardholder data; payments are
  handled entirely by our payment processor.

## Data residency

Enterprise customers select a processing region at contract time: United States,
European Union (Frankfurt), or Australia. Once selected, customer data at rest
does not leave that region.

Starter, Growth, and Scale plans are hosted in the United States only. Region
selection is one of the capabilities that pushes regulated Healthcare and
Fintech customers to Enterprise.

## Encryption

- **In transit:** TLS 1.3. TLS 1.0 and 1.1 are refused; TLS 1.2 is accepted only
  for named legacy integrations by exception.
- **At rest:** AES-256.
- **Key management:** keys are managed by the cloud provider's KMS with annual
  rotation. Customer-managed keys (BYOK) are on the 2027 consideration list, not
  committed.

## Access control

- SSO via SAML 2.0 and OIDC on Scale and Enterprise.
- SCIM user provisioning on Enterprise.
- Role-based access control on all plans; granular per-workflow permissions on
  Scale and above.
- Immutable audit log on Scale and Enterprise, retained 400 days.
- Internal access to production follows least privilege, requires hardware MFA,
  and every session is logged and reviewed quarterly.

## Availability and continuity

- Uptime commitment: 99.9% monthly for Enterprise, with service credits defined
  in `support_sla_policy.md`.
- RPO 1 hour, RTO 4 hours.
- Backups every hour, retained 35 days, restore-tested quarterly.
- Multi-AZ within the selected region; cross-region failover is manual.

## Subprocessors

A current subprocessor list is published on the trust page. Customers on any plan
may subscribe to email notifications of subprocessor changes, sent 30 days before
a change takes effect.

## Incident response

- Severity 1 security incidents are triaged within 1 hour, 24/7.
- Affected customers are notified within 72 hours of confirmation, which also
  satisfies the GDPR notification window.
- A written post-incident review is provided to affected customers within 10
  business days.

## Vulnerability management

- Third-party penetration test annually; summary letter available under NDA.
- Continuous dependency scanning; critical vulnerabilities patched within 7 days,
  high within 30.
- A private bug bounty programme runs with a vetted researcher pool.
