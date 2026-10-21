# Free scheduled monitoring

ADVERSE can use GitHub Actions instead of a paid Render Cron service. The workflow `.github/workflows/monitoring-schedule.yml` is scheduled every 15 minutes and can also be started manually from the repository's **Actions** tab.

## One-time secret setup

The workflow intentionally does not store scheduler credentials in source control. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** and configure:

- `CYBER_MONITORING_CRON_SECRET`: must exactly match the API service's `CYBER_MONITORING_CRON_SECRET` environment variable in Render.
- `MONITORING_CRON_SECRET`: must exactly match the API service's `MONITORING_CRON_SECRET` environment variable in Render.

If either API secret is not already configured or its value cannot be recovered, generate a new high-entropy secret and set the same value in both Render's API environment and the matching GitHub repository secret. Never commit a secret or paste it into an issue or log.

The API URL is currently configured in the workflow as `https://adverse-api-7yim.onrender.com`. Update the workflow if the API's public URL changes.

## Verify it

1. Open the repository's **Actions** tab and select **ADVERSE scheduled monitoring**.
2. Select **Run workflow** to test it immediately after both secrets are configured.
3. Confirm both `cyber-monitoring` and `archive-monitoring` jobs succeed. A missing secret, HTTP 401, HTTP 503, or provider failure will fail the corresponding job and show a bounded error in the run log.
4. Scheduled workflows can start late due to GitHub scheduling load. They are not a strict real-time guarantee.

The workflow requires the API's existing MongoDB-backed persistence. Cyber checks only process assets that users explicitly registered and authorized; it does not scan arbitrary targets. Archive monitoring checks the existing investigation watch list. The API also has in-process workers, so the scheduled workflow is an external trigger/fallback rather than a claim that every check will run exactly every 15 minutes.

GitHub Actions is free within the applicable account/repository usage limits; it is not an unlimited uptime guarantee. No paid Render Cron service is created by this setup.
