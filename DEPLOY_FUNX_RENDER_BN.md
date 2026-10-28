# FunX Render deployment

To deploy the private FunX GitHub repo, grant Render's GitHub installation access
to sazimsifulla1-netizen/FunX at https://github.com/settings/installations.
ChatGPT GitHub access is not the same permission as Render GitHub access.

Admin includes a consented location map viewer, real user presence/last-seen,
registrations, Telegram Bot Token and Chat ID setup with live test,
referral and manual withdrawal review, and a protected status dashboard.

IMPORTANT: render.yaml uses the Free Render plan for PREVIEW only.
Free Render filesystem resets on idle/restart/redeploy. FunX currently persists
accounts, messages, earned rewards, location consent, and Bot Token in JSON.
For production use a paid service with persistent disk and DATA_DIR=/var/data
or migrate to a standalone permanent database. Do not share the unrelated
Together Couple database without explicit authorization.

Verify /health on the real Render URL before rebuilding the Android APK.
The previous APK still points to an expired temporary Cloudflare address.
