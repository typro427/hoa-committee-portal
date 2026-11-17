# iPhone app: run it on your phone and share it on TestFlight

This folder is the iPhone app. It's a native app shell, built with [Capacitor](https://capacitorjs.com), that opens your live committee portal full-screen. Because the app loads the live site, **every update you deploy to Render shows up in the app right away**, with no new app build needed.

What the app adds on top of the website:
- **First-launch screen:** members type their HOA's address once, and the app remembers it and opens straight to their sign-in page. They can also switch between several HOAs.
- **Swipe from the left edge to go back**, and **pull down to refresh**.
- **Uploads from the camera or photo library**.
- **PDFs and documents open inside the app.**
- **A friendly "Can't reach your portal" screen** when offline, with *Try again* and *Change HOA*.
- **App icon and a navy launch screen.**

You don't need Node or npm to build it. Everything Xcode needs is committed, and Xcode downloads the Capacitor library from GitHub on its own.

---

## 1. Open the project in Xcode

You need a Mac with **Xcode** installed (free in the Mac App Store; use the newest version).

1. Open Xcode. On the welcome window, choose **Clone Git Repository…** (or from the menu bar, **Integrate → Clone…**).
2. Paste `https://github.com/typro427/hoa-committee-portal` and click **Clone**. Sign in to GitHub if asked, since the repository is private.
3. When it finishes, go to **File → Open…** and open:
   **`hoa-committee-portal/mobile/ios/App/App.xcodeproj`**
4. Wait for **"Resolving Package Graph"** at the top of the window to finish (about a minute the first time). Xcode is downloading Capacitor.

## 2. Run it on your own iPhone (free, no paid account)

1. **Xcode → Settings → Accounts →** click **+**, then **Apple ID**, and sign in with your normal Apple ID.
2. In the left sidebar, click the blue **App** project icon. Then select the **App** target, open **Signing & Capabilities**, and:
   - **Team:** choose your name ("Personal Team").
   - **Bundle Identifier:** change `com.hoacommitteeportal.app` to something unique to you, like `com.yourname.hoacommittees`. Apple requires every app to have its own.
3. Plug your iPhone into the Mac with a cable. Tap **Trust** on the phone if it asks.
4. On the iPhone, open **Settings → Privacy & Security → Developer Mode**, turn it **on**, and let the phone restart.
5. At the top of Xcode, choose your iPhone as the run destination, then press **▶ (Run)**.
6. The first time only, the phone may say "Untrusted Developer". Go to **Settings → General → VPN & Device Management**, tap your Apple ID, then **Trust**. Press ▶ again.
7. When the app opens, enter your portal's address (your Render address, e.g. `your-portal.onrender.com`, or later `deerfield.yourbrand.com`), then sign in with a PIN.

> With a free Personal Team the app stops opening after **7 days**; just press ▶ again to reinstall. TestFlight doesn't have this limit.

## 3. Share it with a few people on TestFlight

TestFlight is Apple's beta-testing app. It needs a paid **Apple Developer Program** membership ($99/year).

### a. One-time setup
1. **Enroll** at [developer.apple.com/programs](https://developer.apple.com/programs/enroll/).
   - **Individual** enrollment is the fastest, often the same day.
   - **Organization** enrollment (under your LLC) shows your business name in the App Store, but needs a free D-U-N-S number first, which can take a week or two.
2. Back in Xcode's **Signing & Capabilities**, change **Team** to your paid membership team.
3. Create the app record at [appstoreconnect.apple.com](https://appstoreconnect.apple.com): **Apps → + → New App**.
   - **Platform:** iOS.
   - **Name:** the name testers will see. It must be unique on the App Store, e.g. "Deerfield Committees" or your brand name.
   - **Bundle ID:** pick the one you set in Xcode. If it isn't listed yet, build once in Xcode with your paid team, and it registers automatically.
   - **SKU:** anything, e.g. `hoa-committees-1`.

### b. Upload a build
1. At the top of Xcode, set the destination to **Any iOS Device (arm64)**.
2. **Product → Archive.** When it finishes, the **Organizer** window opens.
3. Click **Distribute App**, choose **App Store Connect** (or "TestFlight & App Store"), keep the defaults, and click **Upload**.
4. Apple processes the build. It usually takes 5–30 minutes, and you'll get an email. You won't be asked the export-compliance (encryption) question; the project already declares it only uses standard HTTPS.

### c. Invite your testers
In App Store Connect, open your app and go to the **TestFlight** tab. Pick one of these:

- **Internal testers** (fastest; no Apple review). Up to 100 people who you add to your App Store Connect team: **Users and Access → +**, enter their name and email, give them a limited role such as *Marketing* or *Customer Support*. Then on the TestFlight tab, create an **Internal Group**, add them and the build. They can install as soon as processing finishes.
- **External testers** (anyone with an email or a public link). Create an **External Group**, add their emails or turn on a **public link**, and add the build. The first build goes through a short **Beta App Review**, usually within a day. Fill in **Test Information**, including **sign-in details for the reviewer**: your portal address and a demo member PIN. Make a demo member with sample data for this.

Testers install the free **TestFlight** app from the App Store, open your invite, and tap **Install**. Builds expire after 90 days; upload a new one any time.

## 4. Making changes

- **Anything on the website** (new features, fixes, text): deploy to Render as usual. The app shows it the next time it opens, with **no new build**.
- **Native changes** (app name, icon, the start screen in `mobile/www`, the Swift code): make the change. In Xcode, go to **App target → General** and raise the **Build** number by 1 (e.g. 1 → 2). Then do **Product → Archive** and upload again.
- **App name on the home screen:** App target → General → **Display Name**.
- **App icon:** replace `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` with a 1024×1024 PNG with no transparency.
- **Start screen / offline screen:** edit `mobile/www/index.html` or `mobile/www/error.html`, then copy them into `ios/App/App/public/`. If you have Node installed, run `npm install && npx cap sync ios` in this folder instead.

## Demo tips

- If your Render plan is the free one, the portal sleeps when idle, so the first open can take up to a minute. The Starter plan stays awake.
- Give each demo person their own PIN (Admin → Members), so you can see who did what in the audit log.
- To show several HOAs, add them in the app's **Switch HOA** screen (link on the sign-in page and in My Profile).

## Before the public App Store (later)

Apple reviews public apps more strictly than TestFlight, and it often rejects apps that are "just a website". Phase 3 adds native features (push notifications, Face ID unlock, document scanning) and store screenshots, so the app passes that review. Selling to HOAs on your website (not inside the app) is allowed under Apple's rule for services sold to organizations (App Review Guideline 3.1.3(c)), as long as the app itself has no purchase buttons or pricing.
