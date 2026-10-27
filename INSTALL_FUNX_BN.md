# FunX v3.5 · Easy installation (Bangla guide)

## আপনার ফোনে একবার করুন

1. `FunX35.zip` ফোনের **Downloads** ফোল্ডারে সেভ করুন।
2. নতুন Termux Session খুলুন। ফোন চার্জে রাখুন; Android-এ Termux-এর battery restriction কমিয়ে দিন।
3. নিচের দুটি কমান্ড একসঙ্গে চালান:

```bash
cd "$HOME"
unzip -oq "$HOME/storage/downloads/FunX35.zip" -d "$HOME" && bash "$HOME/FunX/START_FUNX.sh"
```

এটি পুরোনো FunX রিপোজিটরির ওপর নতুন সোর্স বসাবে। আগের `.env`, Admin Secret ও `server/data/` মুছবে না। প্রথম রান হলে Node.js সার্ভার তৈরি, ৩৪টি Backend Test, Cloudflare Tunnel, HTTPS API পরীক্ষা, GitHub-এ নতুন সোর্স পুশ, GitHub Actions-এ APK Build এবং Downloads-এ APK রাখার চেষ্টা করবে। GitHub লগইন প্রয়োজন হলে অনুমতি দিতে হবে। Signing Key তৈরির জন্য প্রথমবার Termux-এ Java ইনস্টল হবে।

ফাইলটি পাবেন: `Download/FunX-NEW/app-debug.apk`। Android-এর Install/Update বোতাম চাপতে হবে। পুরোনো debug APK-র সিগনেচার আলাদা হলে পুরোনো FunX অ্যাপটি একবার আনইনস্টল করতে হতে পারে; **এতে ফোনের লোকাল লগইন মুছে যাবে** কিন্তু সার্ভারের ডেটা অক্ষত থাকলে একই নম্বর/পাসওয়ার্ড দিয়ে আবার লগইন করা যাবে। এই নতুন Signing Key-এর সাহায্যে পরবর্তী v3.5+ APK আপডেটগুলো একই পরিচয়ে সাইন হবে, যতক্ষণ GitHub Secret ও `~/.funx-private/`-এর মূল Key সংরক্ষিত থাকে।

## প্রয়োজনে আলাদা কমান্ড

```bash
bash "$HOME/FunX/tools/funxctl.sh" server  # সার্ভার ও নতুন টানেল
bash "$HOME/FunX/tools/funxctl.sh" apk     # নতুন URL দিয়ে APK তৈরি
bash "$HOME/FunX/tools/funxctl.sh" status  # সার্ভারের অবস্থা
```

## গুরুত্বপূর্ণ সীমাবদ্ধতা

- Cloudflare **Quick Tunnel অস্থায়ী**, স্থায়ী অনলাইন সেবার নিশ্চয়তা নেই; Tunnel URL বদলালে এই স্ক্রিপ্ট দিয়ে নতুন APK বিল্ড করতে হবে। অন্যদের অ্যাপেও নতুন APK ইনস্টল করতে হবে। সত্যিকারের একবার ইনস্টল করে সারাজীবন চালাতে **স্থায়ী HTTPS ডোমেইন ও সবসময় চালু থাকা সার্ভার** প্রয়োজন। স্থায়ী সার্ভার/ডেটাবেস ছাড়া মাল্টি-ইউজার মেসেজিংকে Production Ready বলা যাবে না।
- Termux/ফোন বন্ধ, Android battery optimization বা ইন্টারনেট বন্ধ হলে সেবা বন্ধ হতে পারে।
- Admin PIN শুধুই স্থানীয় প্রবেশপথ। Telegram Bot/লোকেশন দেখতে শক্তিশালী Server Admin Secret লাগবে। এটি বা Bot Token কখনও GitHub-এ Commit করবেন না।
- লোকেশন **শুধু ব্যবহারকারীর সুস্পষ্ট অনুমতিতে** এবং দৃশ্যমান Android notification সহ শেয়ার করা যাবে। ব্যবহারকারী বন্ধ করলে সার্ভার থেকে সক্রিয় অবস্থান মুছে দেওয়া হয়।
- Chat data server-এ সংরক্ষিত, end-to-end encrypted নয়। এই পরীক্ষামূলক রূপে ব্যক্তিগত/গুরুত্বপূর্ণ তথ্য শেয়ার করা উচিত নয়।
- `~/.funx-private`-এর Signing Key এবং password নিরাপদ ব্যাকআপে রাখুন; কারও সঙ্গে শেয়ার করবেন না।
- Google Play-এ প্রকাশ বা বাস্তব ব্যবহারকারীদের কাছে বিতরণের আগে privacy policy, security audit, reliable backend, data retention/deletion সুবিধা দরকার।
