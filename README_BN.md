# FunX v3.4 — Update summary

**এই সংস্করণে সাধারণ ব্যবহারকারীর Server Settings সরানো হয়েছে।** অ্যাপ নিজে সার্ভারে যুক্ত হওয়ার চেষ্টা করবে। অ্যাডমিন প্যানেলে অনুমোদিত/সক্রিয় লোকেশন শেয়ারিংয়ের Google Maps লিংক দেখা যাবে। বিস্তারিত, আপডেট, সীমাবদ্ধতা এবং Termux কমান্ড: **`FUNX_V3_4_UPDATE_BN.md`**।

**সতর্কতা:** ডিফল্ট Cloudflare Quick Tunnel লিংক স্থায়ী নয়; এটি বন্ধ হলে সার্ভার পরিবর্তন/নতুন APK প্রয়োজন হবে। লাইভ লোকেশন শুধু ব্যবহারকারীর স্বচ্ছ সম্মতিতে চালু হয়।

---

# FunX — Termux-tested setup update (v3.1 package)

**Start here:** `TERMUX_QUICKSTART_BN.md` contains the safer HOME-directory installation, integrated API tests, server startup, and health checks. The Android app source remains v3.0; this update changes the Termux scripts and verification guides, not the Android app behavior.

# FunX v3.0 — Android + Node.js + Telegram

**App language:** English (100%). **Developer label:** Sazim Codex ldt.  
**Package:** `com.sazimcodex.funx` · Android 8+ · Target SDK 35.

## নতুন কী আছে

- Intro splash / Get Started, professional FunX icon
- Register (name + phone + password), sign-in, 5-character unique ID
- Login persistence: Android Keystore-protected login token; server session expires after 90 days, then sign in again
- Find contacts by exact FunX ID / complete registered phone number
- Online 1:1 text and compressed photo messages, typing indicator, green double check after read; ~3.6s polling while app visible
- Updates: 24-hour text statuses, Calls: opens the ordinary phone dialer; Settings and Location pages
- Five taps on **FunX inside the app** and `0011` to open admin panel
- Admin can save/delete/test Telegram bot token with a **separate server admin secret** (PIN alone cannot alter server)
- Location sharing only on explicit user opt-in: Android foreground location service + ongoing notification and Stop Sharing button; server sends consented location to Telegram, Google Maps link
- The server optionally alerts administrator to new signup **name and FunX ID**, but not private chat content

## গুরুত্বপূর্ণ সীমাবদ্ধতা ও নিরাপত্তা

- Registration does **not** require location permissions. Chinese-language or deceptive permission prompts and mandatory indefinite tracking were not added. Prompts are transparent and in English. Location can be revoked by the user.
- A launcher icon normally opens on the first tap: Android does not deliver five launcher taps to an unlaunched app. **Only inside the app**, tapping FunX five times opens the PIN panel.
- Background GPS service **cannot** be guaranteed to run uninterrupted: Android OS battery policies, force-stop, GPS disable, permission revocation, device reboot, lost mobile data and Termux/server shutdown affect it. A visible foreground notification remains while active; users can stop sharing.
- Messages **are not end-to-end encrypted** and may be accessible to the server operator. No VoIP calls, push notifications while the app is closed, WhatsApp account connectivity, phone SMS/OTP verification, or guaranteed always-online presence. Do not treat this as production-certified security.
- If you publish a live service, add verified phone/SMS OTP, database migrations/backup, end-to-end message encryption, privacy/deletion policies, rate limits at proxy, abuse reporting, and a professionally hosted HTTPS backend. This is functional development source, not a certified production release.
- Tokens are not hardcoded into Android APK; stored on Termux/server in `server/data` with 0600 permissions. **Never publish `server/.env` or `server/data/`.** Android authentication token is held in Android Keystore.

## ১) Termux-এ সার্ভার চালু করুন (updated v3.1 procedure)

Download the `FunX_v3_1_Termux_Tested.zip` package, then in Termux:

```bash
termux-setup-storage
pkg update -y
pkg install -y unzip nodejs-lts openssl curl
unzip -o "$HOME/storage/downloads/FunX_v3_1_Termux_Tested.zip" -d "$HOME"
cd "$HOME/FunX/server"
bash setup-termux.sh
bash test-termux.sh
bash run-termux.sh
```

From a second Termux session verify health with:

```bash
cd "$HOME/FunX/server"
bash check-running.sh
pkg install -y cloudflared
cloudflared tunnel --url http://127.0.0.1:8787
```

The server runs inside Termux HOME, not public Download storage, to better protect the Bot Token and user data. The HTTPS address from the second command is temporary, and the tunnel must stay open. Read `TERMUX_QUICKSTART_BN.md` for troubleshooting and limitations.

## ২) Android APK বানান (GitHub Actions)

GitHub-এ নতুন repository তৈরি করে ZIP-এর **`FunX` ফোল্ডারের ভেতরের** `app`, `server`, `build.gradle`, `settings.gradle`, `.github` ইত্যাদি root-এ আপলোড করুন। তারপর:

1. **Actions** → **Build FunX APK** → **Run workflow**।
2. সফল হলে **Artifacts → FunX-debug-apk** থেকে APK নামিয়ে ইনস্টল করুন।
3. অ্যাপ খুলুন → **Get Started** → **Register** → প্রথমবার **Server Settings**-এ HTTPS URL বসান।
4. একটি ফোনে register করে ID নিন, অন্য ফোনে আলাদা account খুলে সেই ID দিয়ে Search করুন।

`debug.apk` শুধু ডেভেলপমেন্ট/ফোন টেস্টের জন্য। Android SDK-সহ বাস্তব CI বিল্ডের সফলতা এখানে যাচাই করা যায়নি।

## ৩) Telegram Admin Setup

1. Telegram-এর **@BotFather** দিয়ে একটি নতুন Bot Token নিন।
2. Telegram-এ নিজের chat ID খুঁজে নিন।
3. FunX অ্যাপের ভেতরে **FunX শিরোনামে পাঁচবার ট্যাপ** → PIN `0011`।
4. **Server Admin Secret** (`server/.env` থেকে), **Bot Token**, **Chat ID** বসিয়ে **Save Token** চাপুন। **Send Test** দিয়ে যাচাই করুন।
5. Bot-এ `/start`, `/help`, `/status`, `/latest` ব্যবহার করতে পারবেন। লোকেশন শেয়ারিং বন্ধ থাকলে লোকেশন দেখাবে না।
6. **Delete Token** সার্ভার থেকে Bot Token মুছে দেয়।

**লোকেশন শেয়ারিং:** প্রতিটি ব্যবহারকারী FunX-এর **Location → Start Sharing** থেকে পৃথক সম্মতি দিয়ে Android পারমিশন মঞ্জুর করলে সার্ভার থেকে Telegram-এ লোকেশন যায়। **Stop Sharing**, notification Stop action, বা Android permission বন্ধ করলে আপডেট বন্ধ হয়। জোর করে চালু রাখা যায় না।

## ৪) সার্ভার পরীক্ষা

Termux-এ:

```bash
cd "$HOME/FunX/server"
bash test-termux.sh
```

এটি আলাদা temporary test database-এ 28 assertions চালায় (register, login, unique ID, search, message, typing, read, location consent, admin security, bot token save/delete, signout)। আসল ডাটাবেসে কোনো পরিবর্তন করে না।

## ফাইল বিন্যাস

- `app/src/main/assets/index.html` — সব English UI, intro, chats, ID lookup, settings, admin controls
- `app/src/main/java/com/sazimcodex/funx/MainActivity.java` — WebView and native permissions
- `LiveLocationService.java` — foreground GPS service + stop notification
- `RemoteLocationReporter.java` — HTTPS authenticated GPS submissions
- `SecureSession.java` — Android Keystore session storage
- `server/server.js` — account, message, read receipts, typing, GPS and bot endpoints
- `server/setup-termux.sh`, `run-termux.sh`, `test.js`
- `.github/workflows/build-apk.yml` — APK build pipeline

## Disclaimer

FunX is an independent app and is not WhatsApp or affiliated with WhatsApp/Meta. Use only with the informed consent of people whose accounts, messages, or locations are involved.
