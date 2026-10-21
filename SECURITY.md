# Security Policy

ADVERSE is a public-information discovery and source-verification product. Security reports are welcome.

## Reporting a vulnerability

Please do not publish exploit details, private user data, credentials, or working attack payloads in public issues. Report suspected vulnerabilities privately through the repository owner's GitHub contact/profile and include:

- Affected URL, endpoint, or commit.
- Impact and realistic reproduction steps.
- Any relevant request IDs or redacted logs.
- Whether the issue is reproducible in a fresh session.

Do not include passwords, session cookies, API keys, or other secrets in a report.

## Security boundaries

- Only use ADVERSE's monitoring features on websites and systems you own or have explicit permission to monitor.
- Public website verification must reject private, loopback, link-local, and other non-public destinations. This is defense-in-depth, not a guarantee against every DNS rebinding or infrastructure edge case.
- Keep JWT/session secrets, database credentials, scheduler secrets, provider API keys, and email credentials in the deployment provider's secret store. Never commit them to Git.
- Private investigation and monitoring data must be protected by authentication and appropriate ownership checks.
- Avoid exposing detailed environment configuration, secrets, or internal provider inventories from public health endpoints.

## Verification status

A deployment being marked live does not mean that every security property has been independently audited. Check the current CI results and deployment health before relying on a release. Security claims must be tied to reproducible tests and reviewed evidence.
