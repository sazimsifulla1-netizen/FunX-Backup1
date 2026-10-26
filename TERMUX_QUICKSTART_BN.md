# FunX Termux — পরীক্ষা ও চালানোর সহজ নিয়ম

## A. প্রথমবার সেটআপ (Termux-এ পেস্ট করুন)

আগে `FunX_v3_1_Termux_Tested.zip` ফাইলটি ফোনের **Download** ফোল্ডারে সেভ করুন।

```bash
termux-setup-storage
pkg update -y
pkg install -y unzip nodejs-lts openssl curl
unzip -o "$HOME/storage/downloads/FunX_v3_1_Termux_Tested.zip" -d "$HOME"
cd "$HOME/FunX/server"
bash setup-termux.sh
bash test-termux.sh
```

**প্রত্যাশিত ফলাফল:** `PASS: 28 backend integration assertions`, তারপর `PASS: FunX backend test suite completed.`

`unzip: cannot find ...` হলে ফাইলের নাম ও `Download` ফোল্ডার মিলিয়ে দেখুন। যদি আগের নামের ZIP ব্যবহার করেন, সেই নাম লিখুন।

এভাবে কাজ করলে ZIP ফাইল শুধু Download-এ থাকে, আর **সার্ভার ও তার ব্যক্তিগত ডেটা Termux-এর HOME-এ থাকে**। Android-এর সাধারণ Download ফোল্ডারে `.env`, Bot Token বা মেসেজ ডেটা রাখবেন না।

## B. সার্ভার চালু করা (Termux সেশন ১)

```bash
cd "$HOME/FunX/server"
bash run-termux.sh
```

প্রত্যাশিত: `FunX running on http://127.0.0.1:8787`। এই সেশন খোলা রাখুন। `Ctrl+C` দিয়ে বন্ধ করতে পারবেন।

## C. সার্ভার চালু কিনা দেখা (Termux সেশন ২)

Termux-এর বাঁ দিক থেকে swipe করে নতুন session খুলুন, অথবা নতুন session যোগ করুন:

```bash
cd "$HOME/FunX/server"
bash check-running.sh
```

প্রত্যাশিত: `{"ok":true,"service":"FunX","version":"3.0"}` ও `PASS: FunX server is responding.`

## D. অন্য ফোন থেকেও অ্যাপ সংযোগ (সেশন ২)

```bash
pkg install -y cloudflared
cloudflared tunnel --url http://127.0.0.1:8787
```

আউটপুটের `https://...trycloudflare.com` লিংকটি FunX অ্যাপের `Server Settings`-এ বসান। এই লিংক **অস্থায়ী**, পরিবর্তিত বা বন্ধ হতে পারে। প্রকাশ্য ও দীর্ঘমেয়াদি ব্যবহারে স্থায়ী HTTPS hosting, rate limit, backup ও secure configuration প্রয়োজন।

## E. Telegram Bot (ঐচ্ছিক)

- অ্যাপের **FunX** লেখায় ৫ বার ট্যাপ → PIN `0011`।
- Termux-এ সার্ভার owner-এর গোপন server key দেখতে `grep '^FUNX_ADMIN_SECRET=' "$HOME/FunX/server/.env"`। **কীটি কাউকে দেখাবেন না।**
- BotFather Token, Chat ID ও server key দিয়ে Save Token, এরপর Send Test।
- শুধু স্পষ্ট সম্মতিতে চালু করা `Live Location` Telegram-এ যাবে। ব্যবহারকারী Stop Sharing করলে আপডেট বন্ধ হবে।

## সমস্যা হলে

- `pkg` ব্যর্থ হলে Termux-এর package mirror/repo ঠিক আছে কিনা যাচাই করুন।
- `EADDRINUSE` হলে 8787 পোর্টে আগে থেকে সার্ভার চলছে; `bash check-running.sh` পরীক্ষা করুন।
- `signal 9` বা অ্যাপ নিজে বন্ধ হলে Android 12+ ব্যাকগ্রাউন্ড-প্রসেস সীমাবদ্ধতা হতে পারে।
- Internet না থাকলে অন্য ফোনের চ্যাট ও Telegram বার্তা পৌঁছাবে না।
- Android GPS, location permission বা notification বন্ধ হলে লাইভ শেয়ারিং আপডেট বন্ধ হতে পারে; অ্যাপে এটি স্পষ্টভাবে জানানো হয়।
- APK build এখানে যাচাই করা হয়নি; GitHub Actions build আলাদাভাবে সম্পন্ন করতে হবে।

**নিরাপত্তা:** শুধু নিজের সার্ভার চালাবেন। Bot Token, `.env`, `data/` বা লগে থাকা কারও ফোন/লোকেশন পাবলিক GitHub-এ আপলোড করবেন না।
