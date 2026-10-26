# FunX v3.0 — Test Report

Date: 27 October 2026

## Successful automated checks

- **28/28 Node.js backend integration assertions** passed using a separate temporary database (`node server/test.js`). Covers health, registration, user ID uniqueness, duplicate prevention, login/session, user lookup, message send/receive, typing, read receipts, location refusal without consent, sharing, stopping/clearing, admin authentication, Telegram token save/read/delete, user status, logout and persistence.
- **English-only inspection:** all Android UI, manifest, and Java source content checked; no Bengali-script text found.
- **HTML JavaScript** passed syntax parsing through `node:vm`.
- **Browser mock/manual interaction with live local Node API:** intro, server settings, registration, 5-character ID, tabs, location consent popup, five-tap admin unlock `0011`, bot admin UI passed. No JavaScript page errors in completed run.
- **Static project inspection:** permissions, Android manifest, Gradle GitHub workflow and icon asset included.

## NOT tested / limitations

- Android SDK and an Android device/emulator were not available in this runtime. Consequently **an APK has NOT been compiled or installed**, and GPS precision, foreground service runtime, phone permissions, Android 13/14/15 compatibility and notification delivery are NOT device-verified.
- No real Telegram Bot Token or Chat ID was supplied. Integration and admin configuration logic were tested with dummy credentials; **real Telegram delivery not verified**.
- Background battery/doze kills, Termux disconnection, location permission revocation, multi-device long-duration sync, real push notifications, app store publication and production load have NOT been tested.
- No promise of indefinite background execution, passive location without permission, launcher icon five-tap interception or end-to-end encrypted chat.

The project is supplied as **development source with an APK build workflow**, not a guaranteed working installed APK or production-certified WhatsApp equivalent.
