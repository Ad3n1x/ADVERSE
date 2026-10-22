# ADVERSE admin control room

The private control room is available at `/admin` on the deployed web app. It uses a separate server-side admin login; public account registration does not grant admin access.

## Configure Render

In the `adverse-api` Render web service, add:

- `ADMIN_EMAIL`: the administrator email address.
- `ADMIN_PASSWORD_HASH`: a scrypt hash generated locally using the helper below.

Do not put the plaintext admin password in GitHub, source code, or the Render blueprint. Rotate any password that has been shared in chat or another public place before configuring the account.

## Generate a password hash on Windows or macOS/Linux

From a terminal in the repository root:

```sh
cd apps/api
node scripts/generate-admin-password-hash.js
```

Enter a NEW password of at least 16 characters when prompted. The terminal masks input and prints a `salt:hash` value. Copy the complete value into Render's `ADMIN_PASSWORD_HASH` environment variable. Keep the plaintext password in a password manager. Never commit the hash.

Save the environment variables in Render and redeploy the API. Open the deployed web app at `/admin` and sign in with the configured email and the new password.

## Current scope and privacy

The first admin release shows persisted user accounts, account creation dates, and per-user saved investigation counts. It does not reveal passwords, password hashes, provider API keys, session tokens, or private investigation contents. The service must be connected to MongoDB for these statistics.

Search query analytics, verified last-login times, user retention, and provider failure trends are not yet collected; the dashboard explicitly identifies these limitations instead of fabricating metrics. Add privacy-conscious event logging and retention rules before adding those analytics.

Admin authorization is enforced by the API using the configured email, an admin-only signed session identity, and a server-side password hash. The frontend is not the security boundary.
