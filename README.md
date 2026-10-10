# FindMyDeviceBD

বাংলায়: এটি Odoo 17 backend এবং React web frontend দিয়ে তৈরি একটি **সম্মতিভিত্তিক ডিভাইস-লোকেশন শেয়ারিং MVP**। এটি চুরি হওয়া ফোন/ল্যাপটপ খুঁজে পাওয়ার নিশ্চয়তা দেয় না এবং গোপনে কারও অবস্থান অনুসরণ করে না।

## কীভাবে কাজ করে

- একটি বাংলাদেশি মোবাইল নম্বর দিয়ে একটি অ্যাকাউন্ট খোলা যায়। নম্বরটি ইউনিক, তবে SMS/OTP দিয়ে যাচাই করা হয় না।
- নিজের প্রতিটি ডিভাইসে একই অ্যাকাউন্টে লগইন করে **অবস্থান শেয়ার চালু** করতে হবে এবং ব্রাউজারের location permission দিতে হবে।
- অবস্থান শুধু সেই ডিভাইসে ওয়েবসাইট খোলা ও শেয়ার চালু থাকা অবস্থায় পাঠানো হয়। পৃষ্ঠা বন্ধ, ডিভাইস অফলাইন, ব্রাউজার অনুমতি বন্ধ বা ইন্টারনেট না থাকলে নতুন অবস্থান পাওয়া যাবে না।
- অন্য কাউকে যুক্ত করতে তার মোবাইল নম্বরে আমন্ত্রণ পাঠান। ওই ব্যক্তি নিজের অ্যাকাউন্টে আমন্ত্রণ গ্রহণ করলে তবেই তাঁর ডিভাইসের অবস্থান আপনার সঙ্গে শেয়ার হবে। তিনি যেকোনো সময় শেয়ার বন্ধ করতে পারবেন।
- ওয়েব অ্যাপটি অবস্থান-সমন্বিত OpenStreetMap লিংক দেখায়; এটি হারানো ডিভাইস রিমোট-লক, SIM-ট্র্যাক, ব্যাকগ্রাউন্ড ট্র্যাক বা পুলিশি উদ্ধার ব্যবস্থা নয়।

**নিরাপত্তা:** শুধু নিজের বা স্পষ্ট সম্মতি পাওয়া ডিভাইস ব্যবহার করুন। চুরি হলে স্থানীয় কর্তৃপক্ষ/মোবাইল অপারেটরের সহায়তা নিন; নিজেরা কাউকে অনুসরণ বা মোকাবিলা করবেন না। বাস্তব ইন্টারনেট ব্যবহারের আগে HTTPS, ফোন OTP যাচাই, rate limiting, account recovery, privacy/retention নীতি এবং নিরাপত্তা পরীক্ষা যোগ করুন।

SMS যাচাই না থাকায় MVP-তে কেউ অন্যের নম্বর লিখে অ্যাকাউন্ট খুলতে পারে; তাই বাস্তব ব্যক্তির পরিচয় বা ফোন নম্বরের মালিকানা এখনো প্রমাণিত নয়। OTP-সহ যাচাই যোগ না করা পর্যন্ত সংবেদনশীল/বাস্তব লোকেশন শেয়ার করবেন না।

## প্রজেক্টের ফোল্ডার

- `custom_addons/FMDBBackend/customaddons/fmdb_location/` — Odoo 17 account, device, consent invitation এবং JSON API।
- `web/` — React + TypeScript + Vite ওয়েব অ্যাপ।

## লোকাল সেটআপ

এই project-এর Docker Compose-এ PostgreSQL `localhost`-এ সরাসরি প্রকাশ করা নেই; React অ্যাপ Odoo-র `http://localhost:18069` ঠিকানায় proxy করে। Docker Desktop চালু করে এই repository/project folder-এ চালান:

```powershell
docker compose up -d
```

Odoo চালু হলে [http://localhost:18069](http://localhost:18069) খুলে আপনার স্থানীয় PostgreSQL-এ একটি Odoo database তৈরি করুন বা বিদ্যমান database বাছুন। Odoo login/password এখানে নতুন FindMyDeviceBD account নয়—এটি শুধু database setup/admin করার জন্য।

শুধু FindMyDeviceBD-এর addon এই Compose stack-এ mount করা আছে; HavenVerse-এর নিজস্ব আলাদা Compose stack, database এবং data volume রয়েছে। Odoo-তে **Apps → Update Apps List** করুন, `FindMyDeviceBD` খুঁজে install করুন (Developer mode লাগলে চালু করুন)। এর পর:

```powershell
cd web
Copy-Item .env.example .env
npm install
npm run dev
```

`.env`-এ `VITE_ODOO_DB`-এর মানটি আপনার তৈরি/নির্বাচিত database-এর নাম দিন। টার্মিনালে দেখানো Vite ঠিকানা—সাধারণত [http://localhost:5173](http://localhost:5173)—খুলুন। **লোকালহোস্টে** browser geolocation কাজ করে; ফোন থেকে পরীক্ষা করতে হলে একই Wi-Fi-তে HTTPS-সহ deploy/tunnel দরকার, এবং production-এ কখনোই development server সরাসরি প্রকাশ করবেন না।

## বর্তমান সীমাবদ্ধতা

এই MVP-তে ফোন নম্বর কেবল unique account identifier; SMS যাচাই, email/SMS আমন্ত্রণ, মোবাইল OS-এর background tracking, offline tracking, SIM শনাক্তকরণ, push alert, lost-mode lock/wipe বা আইনশৃঙ্খলা বাহিনীর integration নেই। অবস্থান ব্যক্তিগত তথ্য—শুধু স্পষ্ট সম্মতিতে শেয়ার করুন।
