# ADVERSE production operations runbook

This runbook is for the current deployed beta. It intentionally does not claim a backup, recovery, or security control is complete until it has been verified.

## 1. Check service health

- Website: https://adverse-web.onrender.com/
- API liveness: https://adverse-api-7yim.onrender.com/api/v1/health
- API readiness: https://adverse-api-7yim.onrender.com/api/v1/ready
- Render API service: https://dashboard.render.com/web/srv-dbbqbq2fngtc73a716b0
- GitHub Actions: https://github.com/Ad3n1x/ADVERSE/actions

A healthy liveness response means the process responds. A successful readiness response additionally means required runtime dependencies/configuration passed the readiness checks. Neither proves all third-party search providers are healthy.

## 2. Deployment and rollback

1. Check the latest ADVERSE CI run before relying on a new commit.
2. Confirm the API deployment is marked live in Render and inspect recent events/logs for startup failures or repeated restarts.
3. Verify `/api/v1/health`, `/api/v1/ready`, and a representative `/api/v1/public-search?q=OpenAI` request.
4. If a new deployment breaks production, use Render's deployment history to roll back to the last known-good deployment; then open a fix and rerun CI. Do not repeatedly redeploy the same failing commit without investigating the logs.

## 3. Scheduled jobs

- Archive and cyber-monitoring workflows: `.github/workflows/monitoring-schedule.yml`.
- Automated discovery workflow: `.github/workflows/adverse-discovery.yml`.
- Scheduled runs can be delayed by GitHub-hosted scheduling. Review actual run results, not just the presence of a cron expression.
- Failed protected requests commonly indicate a missing/mismatched secret, unavailable API, or endpoint failure. Keep secret values in GitHub Actions/Render secret stores; compare or rotate them in the provider UIs without copying them into issues or chat.
- A successful job proves only that specific run succeeded; inspect trends and recent runs before declaring ongoing reliability.

## 4. MongoDB backup and recovery — required before broad launch

MongoDB connectivity has been observed in production logs, but backup policy and a restore drill have not been verified.

1. Identify the actual MongoDB provider and production cluster using the provider dashboard, without exposing the connection URI.
2. Enable an automated backup/snapshot policy appropriate to the provider and data criticality. Confirm retention, region, access controls, and encryption at rest/in transit.
3. Restrict backup access to the smallest practical set of administrators. Do not upload database dumps to the public repository or ordinary CI logs/artifacts.
4. Arrange a restore into an isolated, non-production database. Never test restore by overwriting production.
5. Verify restored collections and representative records, document the recovery point/time, and record the steps needed to reconnect a test deployment.
6. Record the provider, retention policy, last successful backup, and restore-drill date in an internal operations record. Do not mark the release gate passed before this drill succeeds.

## 5. Incident triage

- **API unavailable:** inspect Render service events and app logs; check deployment status, readiness, and database connection errors.
- **Search returns few/no results:** inspect public-search response metadata for provider failures and query coverage. Provider outages should degrade gracefully and should not be described as verified results.
- **Monitoring fails:** inspect the exact scheduled workflow and step that failed, verify the required secret name is present, then compare the stored secret with the matching Render secret by safely rotating both if necessary. Never print values.
- **Potential SSRF/security report:** preserve a redacted request ID, stop unsafe test traffic, reproduce only in a controlled environment, and follow `SECURITY.md`. URL reachability is not a safety guarantee.
- **Data loss or suspected exposure:** restrict access, preserve relevant logs, rotate affected credentials, assess notification obligations, and restore only after the cause is understood.

## 6. Release gate

ADVERSE should remain a deployed beta until database backup and restore have been demonstrated, ownership/authorization tests cover all private resource families, resilience scenarios are exercised, and an independent security review is completed. Passing CI is necessary but not equivalent to production certification.
