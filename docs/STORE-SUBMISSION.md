# Store submission: App Store and Google Play, version 1.0

This is the submission pack for 1.0: App Review notes, the Play "App access" text, the age rating, the privacy answers, storefronts, the checklist and the submission-day steps. Ops task 10 wrote it (Jira SCRUM-1204), and it replaces `APP_STORE_LAUNCH_CHECKLIST.md` (last audited 2026-06-28).

Ops pastes from this file on submission day (ops task 13a). Nothing here is pasted before then.

- **Listing text** (name, subtitle, keywords, description, categories, URLs, developer name): [`STORE-LISTING.md`](STORE-LISTING.md). It belongs to the seo lane; this file does not repeat it.
- **Screenshots:** seo task 09.
- **Running production, incidents, hotfixes:** Blendn-Admin `DEPLOYMENT.md` § "Operating production".
- **Promoting the API to production:** the ops promotion playbook, `~/.blendn-qa/launch/playbooks/PROD-PROMOTION.md` (on the ops Mac, not in git).

**Credentials never go in git.** The review account's address and password live in two places only: App Store Connect (App Review Information) and Play Console (App access). The password is in `~/.blendn-qa/appreview.pass` on the ops Mac. No user id, event id or password belongs in this file.

**One rule for every text below:** never describe Blend'n as dating, matchmaking or meeting strangers. It's the people at the event you're already at.

## The reviewer's way in

A room opens only to people checked in at a real event, and check-in needs GPS at the venue. A reviewer in Cupertino or anywhere else would be stuck outside (Guideline 2.1). Admin task 06 closes that gap, and it's documented in the notes below, so it isn't a hidden switch (Guideline 2.5.19).

- `npm run seed:review` in Blendn-Admin creates or refreshes the review account and one demo event:
  - slug `review-demo-event`, unlisted, so no one else sees it in any list;
  - its door is open every hour for 7 days from the run;
  - it prints the share link, `https://www.blendn.app/event/<event id>`.
- `REVIEW_ACCOUNT_IDS` on the API lists the review account. That account alone may check in to the demo event from anywhere. Every other rule applies to it as to anyone.
- **The link exists only after the seed has run on production,** the day before submission (ops task 13a, step 1). Until then the notes below carry the marked placeholder `<<DEMO_EVENT_LINK>>`. Replace it in App Store Connect and Play Console, never in this file.
- During review: if it runs past 5 days since the last seed, run the seed again (ops task 13b). A re-run keeps the same event and link.
- After both stores approve: remove the account from `REVIEW_ACCOUNT_IDS` (ops task 13c).

## App Review notes (App Store Connect › App Review Information › Notes)

Sign-in required: **Yes**. Put the review account's address and password in the user name and password fields, from `~/.blendn-qa/appreview.pass`. Contact: the owner's name, phone and email, entered in the console.

Paste this block, with `<<DEMO_EVENT_LINK>>` replaced:

```text
SIGNING IN
On the first screen, tap "Continue with email" and use the account in the Sign-In Information above. It is an ordinary attendee account.

REACHING A ROOM
Each Blend'n room belongs to one real event, and it opens only to people checked in at that event. Check-in normally needs you to be at the venue (it uses your location). So you can review from anywhere, this review account, and only this account, may check in to one demo event without being there. Nothing else is different for it. There is no hidden feature and no setting to flip.
1. Signed in as the review account, open this link on the device: <<DEMO_EVENT_LINK>>
2. Tap Check in and allow location when asked. The demo event accepts check-ins at any hour for the next 7 days.
3. The room opens, and you can post a message. Room info, in the room's top bar, has Report this room.
The demo event is unlisted, so other users never see it.

WHAT ROOMS ARE
Blend'n is for the people at the event you are already at. It is not random or anonymous chat:
- Everyone signs in with Apple, Google or email and gives a date of birth. Under-18s are refused, by the app and by our server.
- A room is open only to people checked in at that event, at a real place, from shortly before the event starts until a day after it ends.
- In a room you appear under a nickname the app gives you, so other guests don't see your name until you choose to show it. Every message is still tied to the signed-in account, so reports and bans act on the person.
- Word, spam and contact-information checks run before a message is delivered. An automated content check (OpenAI's moderation model) runs as it is sent. Reports are reviewed by our staff, who can remove messages and suspend accounts.

WHERE EACH SAFETY CONTROL IS
- Terms: the sign-in screen says "By continuing you agree to our Terms and Privacy Policy". Each room shows the community guidelines the first time you enter it.
- Report a message: long-press someone else's message in a room or a direct message, then Report.
- Report a room: in the room, Room info (top bar), then Report this room.
- Report or block a person: open their profile, then "Report or block".
- See and undo blocks: Me > Settings > Privacy & safety > Blocked.
- Contact us: Me > Settings > Help & legal > Contact support (support@blendn.app). Grievances: Me > Settings > About Blend'n.
- Delete your account: Me > Settings > Delete account (at the bottom).

OTHER
- This version has no in-app purchases.
- A room can show a notice labelled "Sponsored", arranged by the event's organizer. There is no ad SDK and no tracking.
- Location is used only while the app is in use: to show events nearby and to confirm a check-in. It is never shown to other people.
```

## Play Console: App access

Play Console › App content › App access › "All or some functionality in my app is restricted". Add one set of instructions:

- **Name:** `Review account`
- **Username / password:** the review account, from `~/.blendn-qa/appreview.pass`, typed into the console fields.
- **Any other information:** paste this, with `<<DEMO_EVENT_LINK>>` replaced:

```text
Sign in with "Continue with email". Rooms open only to people checked in at an event, and check-in normally needs you to be at the venue. This review account, and only this account, may check in to one unlisted demo event from anywhere: sign in, open <<DEMO_EVENT_LINK>> on the device, tap Check in and allow location. Check-in is open at any hour for 7 days. The room then opens. Nothing else is different for this account, and there is no hidden setting.
```

The same text serves Play's pre-launch report, which can't get past sign-in without it.

## Age rating

The app is 18+ only: a date-of-birth gate in onboarding, enforced by the server too.

**App Store Connect** (the questionnaire changed in 2025, so check the wording in the console as you go):

| Question | Answer |
|---|---|
| User-generated content | Yes |
| Messaging and chat | Yes |
| Advertising | Yes (the "Sponsored" room notice, see [Contains ads](#play-contains-ads)) |
| Unrestricted web access | No |
| Mature or suggestive themes | Infrequent: the profile has an optional "what you're here for" intent. Re-answer if the owner removes it (`OWNER.md`, the open question on that intent) |
| Profanity or crude humour | Infrequent (rooms are written by users) |
| Location shared with other users | No: it never is |
| Gambling, contests, violence, horror, medical, alcohol and drug references, sexual content | None |
| Age assurance | The in-app date-of-birth gate |
| Age rating override | **18+** |
| Made for Kids | No |

**Google Play:**

- **Content rating (IARC questionnaire):** category Social or communication.
  - Users interact or exchange content: Yes.
  - Shares the user's location with other users: No.
  - Digital purchases: No.
- **Target audience and content:** 18 and over only. Not appealing to children.
- **Ads:** Yes (see the next section).
- **Location permission:** foreground only; the manifest has no background location.
- **Foreground service:** none. The manifest removes expo-location's (`__tests__/storeReviewNative.test.ts`).

### Play: Contains ads

**Decided: Yes**, because the room feed shows paid "Sponsored · {brand}" notices, and nothing on the server can switch them off:

- the client draws them in `components/ds/BroadcastNotice.tsx:82`;
- in admin, `canBroadcast(…, "sponsored", grant)` in `lib/rbac.ts` lets any organisation with `may_sponsor` and an approved placement post them;
- `startSponsoredScheduler()` starts at every boot.

Google counts sponsored items in a feed as native ads, and a wrong "No" risks suspension. Fable advisor pick, 2026-11-26. It's reversible: "No" becomes true only once a server switch exists and is off.

## App Privacy and Play Data safety (draft)

**Legal reviews this before submit** (Epic SCRUM-1122; the processor list is SCRUM-1144). Nothing here is final until legal signs it off.

**Re-read it against the actual 1.0 binary.** This draft describes the binary after the client's launch gate 5 (Blend'n+ deleted). The Plus screens are gone (client task 03a). RevenueCat (`react-native-purchases`) is still in `package.json` on `dev` until client task 04 merges. If it ships, add Purchases (purchase history) and RevenueCat to both forms. Task 11 checks this on the real build.

- **Tracking (Apple) / Shared for ads (Play):** none. No ad SDK, no IDFA, no App Tracking Transparency.
- **Encrypted in transit:** yes.
- **Deletion:**
  - in the app: Settings › Delete account;
  - on the web: `https://www.blendn.app/delete-account`.

Each row is linked to the user and collected for app functionality unless the row says otherwise. Optional means the user may leave it empty.

| Data (Apple category / Play category) | What | Why | Optional |
|---|---|---|---|
| Contact info: name, email / Personal info | Account name and sign-in email; phone number if the user adds one | App functionality, account management | Phone: yes |
| Other data: date of birth, gender / Personal info | DOB for the 18+ gate; gender on the profile | App functionality | Gender: yes |
| Sensitive info: sexual orientation / Personal info: sexual orientation | On the profile; shown to others only if the user turns it on | App functionality | Yes |
| Location: precise and coarse / Location | Precise to confirm a check-in and while in a room; coarse for the city shown | App functionality | No (check-in needs it) |
| Photos / Photos | Profile photos; photos posted in rooms, the Lobby and direct messages | App functionality | Yes |
| User content: messages and other content / Messages, other user-generated content | Room messages, direct messages, Lobby posts, bios, crew names, support requests | App functionality | Yes |
| Identifiers: user ID; device ID / App info and performance, Device or other IDs | Account id; the push token and the Firebase installation ID that delivers notifications | App functionality | No |
| Usage data: product interaction / App activity | Check-ins, waves, room activity | App functionality; analytics (hosts see aggregate counts for their own events, never a name) | No |
| Diagnostics: crash, performance / App info and performance | Sentry crash and performance reports, with personal data scrubbed | App functionality, analytics | No |

**Third parties and processors to name** (privacy policy and the labels):

| Who | What it gets | Where it runs |
|---|---|---|
| OpenAI (moderation) | The text of room messages and posts; room, Lobby and profile images | Server |
| Sentry | Crash and performance diagnostics, scrubbed | App and server |
| Google Sign-In | Sign-in, if the user picks it | App |
| Sign in with Apple | Sign-in, if the user picks it | App |
| Firebase Cloud Messaging (Google) | The Firebase installation ID and push token, to deliver notifications on Android | App (Android) |
| Expo push service | The push token and the notification text | Server |
| Google Maps (Android map SDK) | The map view the user opens | App (Android) |
| OpenFreeMap (map tiles) | Tile requests (IP address, map area) | App |

Hosting and storage (Railway, Tigris) are processors, not partners. Legal decides how the policy names them.

**Also for the submission:**

- **Privacy report:** after archiving, Xcode › Organizer › Generate Privacy Report. Keep the PDF with the submission.
- **`ios/blendn/PrivacyInfo.xcprivacy`** declares no collected data types. Fill it from this table once legal signs it off (ops backlog).
- **Accessibility Nutrition Labels** (App Store Connect):
  - claim Larger Text, Dark Interface, Sufficient Contrast and Reduced Motion;
  - claim Differentiate Without Color only after a check of the room;
  - don't claim VoiceOver, Voice Control or Captions until each has been driven end to end.

## Storefronts

**Decided: India only, on both stores, for 1.0**, because the published privacy policy says Blend'n "is offered only in India". The retention and grievance runbook, the age gate and the listing are written for India too.

- Fable advisor pick, 2026-11-26. It reconciles "India and Canada at launch" (seo `FACTS.md` fact 5) with the task's "India only".
- **Canada joins by a console change** (no new binary, no review) once both hold:
  - a Canadian city is live;
  - the lawyer's Canada revision of the privacy policy is published.
  Fill the English (Canada) localisation at the same time (`STORE-LISTING.md`).
- **App Store Connect:** Pricing and Availability › select countries or regions › India only. Not "All Countries or Regions": that means all 175 storefronts and every future one.
- **Play Console:** Production › Countries / regions › India only.

**EU Digital Services Act trader status:** Apple requires a declaration even for an app not offered in the EU. Whether the company is a "trader" is legal's call (SCRUM-1144). The owner enters it on submission day (below).

## Play: data-deletion URL

Play Console › App content › Data safety › Data deletion: `https://www.blendn.app/delete-account`.

Play's rule is that the page names the app and the developer as the listing does. Read on 2026-11-26:

- **App:** the page says "Blend'n". The listing title is "Blend’n: Meet People at Events" (curly apostrophe).
- **Developer:** the page says "Matrix Social Labs (legally Matryx Social Labs Private Limited)". The listing's developer is "Matryx Social Labs Private Limited" (pending the owner's one-legal-name answer).
- **Its in-app steps are out of date:**
  - the page says "Scroll to Danger zone … tap Delete, then tap Delete My Account";
  - the app has no "Danger zone" label, and its buttons are "Delete account", then "Delete my account" (`app/settings.tsx`).

The page is the seo lane's, which owns the fix. Check it again before pasting the URL.

## Before submit (ops task 11, then 12)

- [ ] **Which commit is the store binary.** Task 11 establishes it from the build itself (`eas build:view`: profile `production`, the git commit). Never assume it from `stage`: pilot build 3 was cut by hand from `f333c0ab`, and `stage` is one build behind TestFlight.
- [ ] **Re-read the privacy draft above against that binary:** RevenueCat present or not; Firebase present; no new SDK.
- [ ] Merged Android manifest: `POST_NOTIFICATIONS` present, `BILLING` absent.
- [ ] 16 KB page alignment of every native library in the production AAB.
- [ ] `aps-environment` is `production` in the signed IPA.
- [ ] EAS production environment: `EXPO_PUBLIC_APP_ENV=production`, the API is `api.blendn.app`, no `EXPO_PUBLIC_REVENUECAT_*` (names and non-secret values only).
- [ ] On a Play-installed build: a venue map renders (the Maps key needs the Play app-signing SHA-1).
- [ ] One real push arrives on the TestFlight install and on a Play internal-test install.
- [ ] Production-profile build installed, launched, signed in and out on an iPhone and an Android phone (`RELEASING.md`: nothing is submitted until it launches).
- [ ] Every launch gate is merged and promoted to production (task 12, the promotion playbook).
- [ ] Legal has signed off the privacy answers and the trader status.
- [ ] The deletion page matches the listing (above).

Task 11 records its results and build numbers here, under this heading.

## Submission day and after

**13a, the day before:**
1. On production, run `seed:review` with the password from `~/.blendn-qa/appreview.pass` (never printed). Set `REVIEW_ACCOUNT_IDS` to the printed user id.
2. Sign in once on the production build from outside Bengaluru, check in to the demo event, and sign out.
3. Put the printed link into both notes blocks in the consoles.

**13a, submit (the owner presses the buttons):**
- Paste the listing from `STORE-LISTING.md`, plus the notes, age rating and privacy answers from this file.
- In App Store Connect, select **only** the build number task 11 verified as profile `production`. Staging builds (1.0.0, pointing at staging) sit in the same record. On Play, upload the production AAB as a new production release, and never promote an internal-track release.
- iOS: no in-app purchase attached, and "Manually release this version" selected.
- Play: the production release stays a draft, released by a human.

**13b, during review:**
- Read both consoles each morning, and re-seed past 5 days.
- Answer reviewers from this file. A question it doesn't cover goes to the owner.

**13c, release:** only after the door fallback and the morning results mail are live on production. Then:
- the owner releases;
- landing gets the store links;
- `MOBILE_MIN_APP_VERSION` is set;
- the review account comes out of `REVIEW_ACCOUNT_IDS`.

**Owner steps** for these days are in `~/.blendn-qa/launch/OWNER.md`, ops section.
