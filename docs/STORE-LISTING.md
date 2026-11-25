# App Store and Google Play listing text

Ready to paste. Written for seo task 08 (Jira SCRUM-1258). Ops pastes it into App Store Connect and Play Console when it submits (`docs/STORE-SUBMISSION.md`, ops task 10). Nobody pastes it before then.

- **Source of truth:** the launch facts block (`~/.blendn-qa/launch/lanes/seo/FACTS.md`).
- **Limits:** Apple's product-page and App Store Connect reference pages and Google's store-listing best practices, read 2026-11-25.
- **Each field** sits in its own fenced block. Its count runs on this file, so the count always matches the text that gets pasted.
- **Count from the repo root:**
  - characters are `[...s].length`;
  - Apple counts keywords in **bytes**, commas included, so the keyword field also prints `Buffer.byteLength`.
- **If you edit a field,** re-run its count and the word check at the end of this file.

## App Store (iOS)

**Localisation.** App Store Connect has no English (India) localisation; its English options are Australia, Canada, U.K. and U.S. Paste this into the app's primary English localisation, which the India storefront falls back to. Two cautions:
- **English (U.K.):** if the primary localisation is not English (U.K.), paste the same text into English (U.K.) too. It may be the India storefront's first English slot (from memory, not checked).
- **English (Canada):** leave it empty for 1.0, so it falls back to the primary text. No Canadian city is live yet, and Toronto keywords would bring installs that land on "Coming soon to Toronto". Add it when a Canadian city opens (Fable advisor pick, 2026-11-25).

**Name** (limit 30)

```text ios-name
Blend’n: Meet People at Events
```

```
$ node -e 'const s=require("fs").readFileSync("docs/STORE-LISTING.md","utf8").match(/```text ios-name\n([\s\S]*?)\n```/)[1];console.log([...s].length,"/ 30")'
30 / 30
```

**Subtitle** (limit 30; repeats no word from the name)

```text ios-subtitle
Talk to the room you’re in
```

```
$ node -e 'const s=require("fs").readFileSync("docs/STORE-LISTING.md","utf8").match(/```text ios-subtitle\n([\s\S]*?)\n```/)[1];console.log([...s].length,"/ 30")'
26 / 30
```

**Keywords** (limit 100 bytes)

Rules for this field:
- Commas, no spaces.
- No word from the name or subtitle. "events" is in the name, which the research memo's draft missed.
- No competitor names, so no "meetup".
- `blendn` is there for people who type the brand without the apostrophe.

```text ios-keywords
nightlife,party,bengaluru,bangalore,blendn,friends,club,pub,gig,concert,social,chat,bar,festival
```

```
$ node -e 'const s=require("fs").readFileSync("docs/STORE-LISTING.md","utf8").match(/```text ios-keywords\n([\s\S]*?)\n```/)[1];console.log([...s].length,"chars",Buffer.byteLength(s),"/ 100 bytes",/\s/.test(s)?"HAS SPACES":"no spaces")'
96 chars 96 / 100 bytes no spaces
```

**Promotional text** (limit 170). You can change it without a new review, so update it as cities open.

```text ios-promo
Starting in Bengaluru: check in at tonight’s events, talk to the room under a nickname, and wave at the people you’d like to meet.
```

```
$ node -e 'const s=require("fs").readFileSync("docs/STORE-LISTING.md","utf8").match(/```text ios-promo\n([\s\S]*?)\n```/)[1];console.log([...s].length,"/ 170")'
130 / 170
```

**Description** (limit 4,000): paste [the shared description](#description-both-stores).

| Field | Value |
|---|---|
| Support URL | `https://www.blendn.app/help` |
| Marketing URL | `https://www.blendn.app` |
| Privacy policy URL | `https://www.blendn.app/privacy` |
| Primary category | Social Networking |
| Secondary category | none |
| Price | Free, with no in-app purchases attached to 1.0 |
| Seller / developer | See [Developer name](#developer-name) |

All three URLs returned 200 on 2026-11-25, and each page's `<title>` is its own page: "Help center", "Privacy policy" and the home page. An unknown path on www.blendn.app also returns 200, so the titles are the real check.

## Google Play

**App name** (limit 30). It's the iOS name. "Free" is not allowed in a Play title.

```text play-title
Blend’n: Meet People at Events
```

```
$ node -e 'const s=require("fs").readFileSync("docs/STORE-LISTING.md","utf8").match(/```text play-title\n([\s\S]*?)\n```/)[1];console.log([...s].length,"/ 30")'
30 / 30
```

**Short description** (limit 80). It's the site's headline. Google doesn't allow "free" in this field.

```text play-short
Meet the people at the event you’re already at.
```

```
$ node -e 'const s=require("fs").readFileSync("docs/STORE-LISTING.md","utf8").match(/```text play-short\n([\s\S]*?)\n```/)[1];console.log([...s].length,"/ 80")'
47 / 80
```

**Full description** (limit 4,000): paste [the shared description](#description-both-stores).

| Field | Value |
|---|---|
| App category | Social |
| Contact email | `support@blendn.app` |
| Website | `https://www.blendn.app` |
| Privacy policy | `https://www.blendn.app/privacy` |
| Account deletion URL | `https://www.blendn.app/delete-account` (Data safety is ops task 10's) |
| Developer name | See [Developer name](#developer-name) |

## Description (both stores)

This is the iOS description and the Play full description. Its first two lines are the hero on www.blendn.app.

```text description
Meet the people at the event you’re already at.
Check in when you arrive, see who else is in the room, and say hi when you’re both ready. Free, for adults 18 and over.

FIND WHAT’S ON
The Pulse is a live map of your city tonight, with the places that have something on lit up. Tap “I’m going” on an event and it waits for you in Going.

CHECK IN WHEN YOU GET THERE
Check in at the event and its room opens to you. Only people checked in at the event get into its room.

TALK TO THE ROOM
In the room you go by a nickname the app gives you, like Cosmic Panda. Ask how long the queue is, save someone a seat, find the afters.

WAVE. TALK IF THEY WAVE BACK.
Wave at someone. If they wave back, you can talk one to one, still under your nicknames. You choose if and when to show who you are.

BRING YOUR CREW
Make a crew with your friends and see which of them are in the room with you.

YOU’RE IN CONTROL
Report or block anyone from their profile, and reports go to our team. Room messages are checked automatically before others see them.

Starting in Bengaluru.
Hosting an event or running a venue? Blend’n for organizers is at organizers.blendn.app.
Questions: support@blendn.app
```

```
$ node -e 'const s=require("fs").readFileSync("docs/STORE-LISTING.md","utf8").match(/```text description\n([\s\S]*?)\n```/)[1];console.log([...s].length,"/ 4000")'
1178 / 4000
```

**Where each claim comes from.**
- Client paths are on `origin/dev`.
- Admin paths are in the launch snapshot, which the facts block says matches `origin/dev` for these files.

| Line | Source |
|---|---|
| Headline, sub-line, "Free, for adults 18 and over" | FACTS.md facts 1, 2, 4 and 6 |
| The Pulse, a live map; "I’m going"; Going | `app/(tabs)/events.tsx`, `components/home/HomeMap.tsx`, `lib/eventFacts.ts:126`, `app/(tabs)/going.tsx` |
| Check in, then the room opens; only checked-in people get in | `lib/checkIn.ts:101` (`submitCheckIn`), admin `app/api/mobile/events/[eventId]/chat/route.ts:134` |
| A nickname the app gives you, like Cosmic Panda | admin `lib/anonymous-names.ts:8`, `lib/board.ts:73` ("a pseudonym, never a name") |
| Wave; talk one to one if they wave back; choose when to show who you are | `lib/waves.ts:102`, `app/user/[id].tsx:796`, `lib/roomState.ts:36-40` (`revealed`) |
| Crew; which friends are in the room with you | `app/crews/new.tsx`, `lib/crews.ts:247` (`myCrews`, "Your crews here now") |
| Report or block from a profile; reports reach the team | `app/user/[id].tsx:773` ("Report or block"), `app/blocked-users.tsx` |
| Room messages checked before others see them | admin `chat/route.ts:39-46` (`moderateMessage`, `preSaveCheck`), admin `lib/moderation/held-row.ts` (held while the check runs, never emitted) |
| Starting in Bengaluru | FACTS.md fact 5 |

**Left out on purpose:**
- **Dating as a reason to be there.** Pending the owner (FACTS.md fact 20).
- **Photo checks.** DM photos are not checked (trust lane).
- **Canada.** No Canadian city is live.
- **Everything in "Do not do"** in the seo lane README.

## Developer name

| | |
|---|---|
| Developer name, both stores | **Matryx Social Labs Private Limited**: *pending owner confirmation* |

- **Why this name.** It's what `admin/lib/company.ts:11-12` and the three websites use. The owner has not yet confirmed one legal name everywhere (`~/.blendn-qa/launch/OWNER.md`, "One legal name").
- **Apple:** the seller name comes from the Apple Developer account's organisation (D-U-N-S) record, not from this file. Check that it reads the same.
- **Play:** the developer name is set in Play Console.

**The deletion page today.** `https://www.blendn.app/delete-account` (BlendnLanding `origin/main` `d2b423e`, `src/content/delete-account.md:4`) reads:

> - **Developer:** Matrix Social Labs (legally Matryx Social Labs Private Limited)

It names both forms. The listing's exact string is on the page, but in brackets after the brand. Play's rule is that the deletion page names the developer as listed. If the owner keeps this name, the page can lead with it; that's a one-line change for seo task 02's follow-up.

## Word check

This runs over every field block above. Each pattern must print 0:
- banned words (substrings, so "safety" counts as "safe");
- "anonymous", because App Review 1.2 rejects "random or anonymous chat";
- prices and in-app purchase words;
- competitor names.

```
$ node -e 'const t=[...require("fs").readFileSync("docs/STORE-LISTING.md","utf8").matchAll(/```text [\w-]+\n([\s\S]*?)\n```/g)].map(m=>m[1]).join("\n");for(const w of ["dating","match","meet strangers","stranger","verified","safe","age-checked","anonymous","blend’n+","blend'"'"'n+","plus","night pass","₹"," rs.","inr","$","price","purchase","subscription","premium","fizz","timeleft","partiful","bumble","meetup","hinge","tinder"])console.log(w,t.toLowerCase().split(w).length-1)'
dating 0
match 0
meet strangers 0
stranger 0
verified 0
safe 0
age-checked 0
anonymous 0
blend’n+ 0
blend'n+ 0
plus 0
night pass 0
₹ 0
 rs. 0
inr 0
$ 0
price 0
purchase 0
subscription 0
premium 0
fizz 0
timeleft 0
partiful 0
bumble 0
meetup 0
hinge 0
tinder 0
```

## Not here

- **Screenshots:** seo task 09.
- **The one custom product page, for the door QR:** seo task 19.
- **In-app events:** none at launch. Apple allows only 10 published at a time, each reviewed.
- **App Review notes, age rating, App Privacy and Data safety:** ops task 10.
