# FunX v3.4 — Automatic Server and Admin Live Location Links

## পরিবর্তন

- সাধারণ ব্যবহারকারী অ্যাপ খুললেই Intro/Registration দেখবেন; Server Settings পপআপ দেখবেন না। Settings/Menu থেকেও Server Settings বাদ।
- নতুন APK-তে ডিফল্ট সার্ভার URL দেওয়া আছে: `https://ladies-cdt-childhood-namespace.trycloudflare.com`। **এটি অস্থায়ী Cloudflare Quick Tunnel; টানেল বন্ধ হলে অ্যাপ কানেক্ট করবে না।** স্থায়ী সার্ভার হলে পরের বিল্ডে DEFAULT_SERVER পরিবর্তন করতে হবে।
- Intro/Registration/Chat-এর FunX লোগো/লেখায় পাঁচবার ট্যাপ → `0011` → Admin Panel। Server URL পরিবর্তন শুধু এই প্যানেলে। PIN যথেষ্ট নয়; ব্যবহারকারীর লোকেশন ও Bot কনফিগ দেখতে সার্ভারের শক্তিশালী Admin Secret প্রয়োজন।
- Admin Panel → **Active Shared Locations → Refresh Location Links**: কেবল ব্যবহারকারী নিজে সম্মতি দিয়ে লাইভ শেয়ারিং চালু রাখলে এবং সর্বশেষ GPS আপডেট **১০ মিনিটের মধ্যে** হলে নাম, ID, সময়, accuracy এবং Google Maps লিংক দেখাবে। বন্ধ করলে লিংক তালিকা থেকে সরানো হবে।
- নতুন সার্ভার API `GET /api/admin/locations`: `X-Admin-Key` ছাড়া 403। শেয়ারিং বন্ধ/পুরোনো লোকেশন দেখায় না।
- ব্যবহারকারীকে ইংরেজিতে স্পষ্ট করে জানানো হয় যে Admin Panel-এ লোকেশন লিংক দেখা যেতে পারে। লোকেশন শেয়ারিং সবসময় ঐচ্ছিক এবং Android-এর দৃশ্যমান নোটিফিকেশনসহ।

## Termux-এ আপডেট (লাইভ ডাটাবেস মুছবেন না)

`FunX_v3_4_Admin_Location_Complete.zip` ফোনের Download ফোল্ডারে রাখুন। আলাদা Termux Session-এ:

```bash
cd "$HOME"
unzip -o "$HOME/storage/downloads/FunX_v3_4_Admin_Location_Complete.zip" -d "$HOME"
cd "$HOME/FunX/server"
node --check server.js
node test.js
cd "$HOME/FunX"
git add app/src/main/assets/index.html app/build.gradle server/server.js server/test.js FUNX_V3_4_UPDATE_BN.md
git commit -m "FunX v3.4 admin live location links and automatic server"
git push origin main
```

উপরের কমান্ড `.env` / `server/data/` সরায় না। GitHub Actions স্বয়ংক্রিয়ভাবে APK বিল্ড শুরু করার কথা।

### চালু থাকা সার্ভার আপডেট

Termux-এর **সার্ভার চালু থাকা Session-এ** `Ctrl+C` দিয়ে পুরোনো Node প্রসেস বন্ধ করুন; তারপর:

```bash
cd "$HOME/FunX/server"
bash run-termux.sh
```

Cloudflare Tunnel Session চালু রাখতে পারবেন, তবে তা যদি বন্ধ হয়ে নতুন Quick Tunnel URL তৈরি হয়, ওই URL-টি APK-এর built-in default হিসেবে পুনরায় বিল্ড করতে হবে।

## সীমাবদ্ধতা

অ্যাপের লঞ্চার আইকনে পাঁচবার ট্যাপ শনাক্ত করা সম্ভব নয়; অ্যাপের ভেতরেই পাঁচবার ট্যাপ কাজ করে। Server Secret কপি/শেয়ার করবেন না। ডিবাগ APK জনসাধারণকে দেওয়ার আগে আরও নিরাপত্তা পরীক্ষা ও স্থায়ী সার্ভার ব্যবহার করুন। Location permission বাতিল করলে বা ফোন/Termux সার্ভার বন্ধ হলে লোকেশন আপডেট বন্ধ হতে পারে।
