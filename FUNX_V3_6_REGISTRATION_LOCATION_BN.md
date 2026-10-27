# FunX v3.6 — Registration Location Permission

## What changed

- Registration now displays a **separate, unchecked, optional** live-location sharing checkbox, distinct from the account privacy notice.
- On selecting it, the Android app requests foreground (coarse/fine) location permission. On Android 13+, it separately requests notification permission so the sharing service has a visible ongoing notification.
- Accepting Android permissions before registration **does not start location collection or upload**. After a successful account registration, FunX activates server-side sharing consent, securely saves its user session and starts its visible location foreground service.
- Declining permission does not block account creation. Unchecking before registration prevents sharing even if Android permission was previously granted.
- Users can stop location sharing from FunX Location or via the ongoing Android notification. Server administrators only see opt-in locations refreshed within the last 10 minutes.
- Existing Location-tab consent workflow remains.
- No claim of indefinite/guaranteed background operation (Android power controls may stop services).

## Updated files

- `app/src/main/assets/index.html` — registration consent and startup flow
- `app/src/main/java/com/sazimcodex/funx/MainActivity.java` — permission request / callback bridge
- `app/build.gradle` — version 3.6, versionCode 6

## Test checklist

1. Fresh install: register page shows unchecked optional Share Live Location next to account privacy notice.
2. Tap location checkbox: Android permissions appear; no location data has been transmitted yet.
3. Deny: location checkbox resets and regular registration still works.
4. Grant, then uncheck: regular registration succeeds with sharing OFF.
5. Grant and register: account is created; visible location notification starts.
6. Turn on device location; sign in to another test device; admin refresh should display opted-in GPS coordinates and map link once a valid update has uploaded.
7. Tap Stop Sharing notification: no further uploads; admin listing clears after stop request reaches server.
8. On Android 13+, deny notification permission; app should not start location sharing during registration.

Note: this source patch has been statically checked and server tests pass. A real Android build and permission/GPS test must still be run on-device.
