# Blend'n redesign: sharing, link previews (OG), deep links, rich push (research, round 2)

Date: 2026-10-03. For Claude Design (mobile redesign brief).

## How to read this

The research used WebSearch, WebFetch and `curl` of live pages (fetched 2026-10-03), plus reads of three local repos:
- admin `seville`
- client `repos/blendn` at `origin/dev`
- landing `repos/blendnlanding`

Every claim carries one of these tags:

| Tag | Meaning |
|---|---|
| **[V]** | Verified from a primary source: vendor docs, the statute, or a platform's own help pages. |
| **[P]** | A practitioner or secondary source. Credible but not official. |
| **[M]** | Measured by me today: a curl of the live page, an image I encoded, or a number I computed. |
| **[C]** | Verified in our code. |
| **UNVERIFIED** | Plausible but not confirmed. Do not build on it without a check. |

Copy for push, interruption levels and Android channels already live in the sibling file `research-notifications.md` §8.7–8.8. §F below covers only the *visual* treatment and stays consistent with that file.

---

## 0. Decisions in one page

1. **Every share is a link to `https://www.blendn.app/…`, rendered server-side, with a dynamic dark card.**
   - Events use `/e/<uuid>`, venues `/v/<uuid>`, and friend invites keep `/f/<token>`.
   - Today's event share sends plain text with no link [C]. Fixing that is the single biggest win.
2. **The card is the product's front door in WhatsApp.**
   - WhatsApp and iMessage build the preview on the **sender's phone**, at the moment of sending [P: Mysk]. The card is a frozen snapshot.
   - Never put anything live or count-based in it. It goes stale immediately, and in small circles it can identify people.
3. **The card template is dark, near-black, with a center-square-safe composition.**
   - The cover (or the title, when there is no cover) sits in the middle 630×630. WhatsApp sometimes center-crops to a square [P].
   - The date block and the monogram go on the wings.
   - The title is in `og:title`, not burned into covered cards.
4. **Encode JPEG, not PNG.**
   - A photo-backed 1200×630 card is **928 KB as PNG and 118 KB as JPEG q82** [M].
   - Meta's official WhatsApp limit is 600 KB [V]. Practitioners see silent drops above ~300 KB [P].
   - `ImageResponse` emits PNG only, so transcode with `sharp`.
5. **Host `/e` and `/v` on the Next.js server and proxy them through `www.blendn.app` with a Vercel external rewrite.**
   - Universal links, App Links and OG then all live on one domain.
   - Vercel caches the proxied responses by `Cache-Control` [V].
6. **The in-app share tray has four actions:**
   - card preview,
   - **WhatsApp**,
   - **Instagram Story**,
   - **Copy link**,
   - **More…**, which opens the system sheet.

   People, matches, crews, rooms, check-ins and live presence get no share affordance at all.
7. **Deferred deep links:**
   - Android uses the Play Install Referrer through `expo-application` (already installed [C]).
   - iOS gets no deferred link in v1.
   - Firebase Dynamic Links is dead: it shut down on 2025-08-25 [V].
8. **Push visuals:**
   - A new, heavier **status-bar glyph**: the current icon's stroke is ~1.3 dp at 24 dp [M].
   - Brand accent `#F05423`.
   - Event **cover images only on "starts soon" and "waitlist → you're in"**.
   - A **creature avatar, never a photo**, on DMs (iOS communication notifications, v2).
   - No action buttons for anything consequential (reveal, accept a match).

Three findings outside the brief that need an owner:

- **Font licence.** The admin repo is **public** and tracks `app/fonts/Satoshi-{400,500,700}.woff2` (added in #80, 2026-08-05) [C].
  - The ITF Free Font License v2.0 forbids distribution through a "repository" or "publicly accessible servers" (§02, `FFL.txt` in today's Fontshare download) [V].
- **Brand drift in the client config** [C]:
  - Accent `#F05524`, splash `#0F0E0E` and LED colour `#FF6B6B`.
  - The brand values are `#F05423` and `#0D0C0C`.
- **Event slugs are guessable.**
  - `events.slug = slugify(title)` with a `-2` suffix [C].
  - A slug URL would make unlisted events guessable and leaks the title into the URL. Share links must use the UUID.

---

## 1. Current state

**Verified today in code [C]:**

- **Event share.**
  - Code: `components/screens/EventDetailScreen.tsx:939` and `app/(tabs)/going.tsx:233`.
  - Both call `Share.share({ title, message: "title\nvenue\naddress" })`.
  - On Android, RN maps `title` to `Intent.EXTRA_SUBJECT`, not `EXTRA_TITLE` (`ShareModule.kt:39-43`) [C, from the RN source]. The Sharesheet preview therefore shows bare text. On iOS the `url` field is never passed.
- **Friend invite.** `lib/useFriendInvite.ts:40` calls `Share.share({ message: inviteMessage(invite.url) })` with `https://www.blendn.app/f/<token>`.
- **Universal links.**
  - The landing AASA lists only `{"/": "/f/*"}` for `S4PDH4SY2R.com.matryxsociallabs.blendn`.
  - `assetlinks.json` has two SHA-256 fingerprints.
  - The client's Android intent filter has `pathPrefix: "/f/"`.
  - Client routes exist at `app/event/[id].tsx`, `app/venue/[id].tsx` and `app/f/[token].tsx`.
- **Landing.**
  - The Vite SPA on Vercel uses legacy `routes`, with `^/f/(.*)$ → /invite.html`.
  - Its OG images are static 1200×630 PNGs of 174–196 KB: light cream, headline on the left, gradient monogram on the right.
  - With that layout, a center-square crop (x 285–915) would cut both the headline and the monogram [M].
- **Data available for cards.**
  - `events` has: `title`, `short_description`, `start_time`, `end_time`, `timezone`, `venue_name`, `venue_id`, `city`, `address`, `cover_image_url`, `min_age`, `status` (draft/published/cancelled/completed), `visibility` (public/private/unlisted), `max_capacity`, `current_capacity`.
  - `venues` has **no image column**: `name`, `address`, `city`, `venue_type`, `capacity`, `status`.
- **Push.**
  - 16 kinds are listed in `lib/push-notifications.ts:17`.
  - The reminder goes out **60 min** before start (`reminder-sweeper.ts:39`, `sendEventReminders(60)`).
  - Channels are `messages` and `events` (HIGH), `rooms` (DEFAULT) and `default` (MAX).
  - The notification icon is `assets/logo/monogram-white.png`: 453×534, not square, a monoline outline [C, M].
- **Packages.**
  - Client: `expo` ~57.0.25, `expo-notifications` ~57.0.21, `expo-router` ~57.0.23, `expo-application`, `expo-clipboard`, `expo-file-system`. It does **not** have `react-native-share` or `expo-sharing`.
  - Admin: `next` ^16.3.6, with `sharp` 0.35.4 present in `node_modules`.

---

## A. Link previews by platform (2025–26)

### A.1 Who fetches, and what they read

The fetch location matters for two things:
- **Staleness.** A preview generated on the sender's device is frozen in the chat.
- **Whose IP our server sees.**

| Platform | Who fetches the page | Tags it uses | Image rules | Limits | Refresh / cache |
|---|---|---|---|---|---|
| **WhatsApp** (India's #1) | **Sender's device** [P: [Mysk 2020](https://mysk.blog/2020/10/25/link-previews/)]. UA `WhatsApp/2.x.x.x A\|I\|N` [V]. | `og:title` ("without any branding"), `og:description` ("1 or 2 lines and 80 characters will suffice"), `og:url` ("undecorated, without session variables, user identifying parameters"), `og:image`. All non-empty and in `<head>` [V] | ≥300 px wide, aspect ≤4:1 [V]. Small thumbnail if 100–300 px wide, full-width if ≥300 px [P]. Center-crops away from 1.91:1, and "sometimes shows a small square crop" [P: [opengraphplus](https://opengraphplus.com/consumers/whatsapp/images), [PR example](https://github.com/AyoubMoussaoui/printlab-website2/pull/16)] | Image **<600 KB** [V]. `<head>` must be inside the first **300 KB** of HTML [V]. Practitioners report silent drops above ~300 KB [P: [andrewbaker](https://andrewbaker.ninja/2026/03/05/fix-thumbnail-previews-on-whatsapp-linkedin-x-guide/), [opengraph.to](https://www.opengraph.to/articles/og-image-too-large)]. HTTPS is required [P] | No server cache to purge: each new send re-fetches on the sender's phone, and old messages stay frozen (inference from sender-side generation). A ~7-day device cache is UNVERIFIED [P]. Users can turn previews off in Settings › Privacy › Advanced [P: [Beebom](https://beebom.com/whatsapp-disable-link-previews/)], so **the message text must stand alone**. |
| **iMessage / LinkPresentation** | Sender's device [P: Mysk] | `og:title` (no site name; use `og:site_name`), `og:image`, `og:video`, icons from `apple-touch-icon` or favicon [V: [TN3156](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages)] | Large preview needs ≥**900 px** wide. "Use graphical content, avoid text." Icons ≥108 px square. Under 150 px is ignored or shown as an icon. `og:video` replaces `og:image` [V] | HTML ≤**1 MB**. Associated resources ≤10 MB. **No JS is executed.** Server redirects are followed, `meta` redirects are not. Serve the same metadata to every UA [V] | Snapshot per message |
| **Instagram DMs** | Meta servers [P: Mysk] | Standard OG [P: [ogrilla](https://www.ogrilla.com/blog/instagram-dm-link-preview-guide)] | 1.91:1, 1200×630 [P] | Meta: ≤8 MB, min 200×200; 600×315 minimum for good display; 1200×630 best [V: [Meta images](https://developers.facebook.com/docs/sharing/webmasters/images)] | Meta Sharing Debugger. `og:image:width`/`height` render the image immediately [V] |
| **Facebook / Messenger** | Meta servers [P: Mysk] | OG | As above [V] | 8 MB [V] | Sharing Debugger. Use a new image URL when the image changes [V] |
| **Telegram** | Telegram servers (UNVERIFIED) | OG plus `twitter:card` | **Large media only with `twitter:card=summary_large_image`**, otherwise a small right-side thumbnail [P: [opengraphplus](https://opengraphplus.com/consumers/telegram/images)] | 5 MB [P] | Send the URL to **@WebpageBot** [V: [Luma help](https://help.luma.com/p/updating-social-images)] |
| **X** | X servers | `twitter:card`, falls back to OG | `summary_large_image`: **2:1**, min 300×157, max 4096², <5 MB, JPG/PNG/WEBP/GIF [P: [X dev forum](https://devcommunity.x.com/t/twitter-card-summary-large-image/144086/2); the official docs URL returned 402] | 5 MB | — |
| **LinkedIn** | LinkedIn servers (fetches ≤50 MB) [P: Mysk] | OG | min **1200×627**, 1.91:1, ≤5 MB [V: [LinkedIn help](https://www.linkedin.com/help/linkedin/answer/a521928)] | — | Post Inspector. ~7-day cache [P] |
| **Slack** | Slack servers (≤50 MB, cache "around 30 minutes") [P: Mysk] | oEmbed, Twitter, OG. **`twitter:label1/data1`, `label2/data2`** show as fields [P: [whitep4nth3r](https://whitep4nth3r.com/blog/level-up-your-link-previews-in-slack/)] | — | Reads only the first 32 KB of HTML [P] | — |
| **Discord** | Discord servers [P: Mysk] | OG plus Twitter. **`theme-color`** colours the embed's left border. `summary_large_image` gives a large image [P: [opengraphplus](https://opengraphplus.com/consumers/discord/tags)] | 1.91:1 | — | — |
| **Google Messages (RCS)** | **Google's servers**: "links … are sent to Google for a quick, secure lookup" [V: [Google support](https://support.google.com/messages/answer/9327749?hl=en)] | OG | The 2025 redesign: "taller cover image with less cropping", favicon plus domain, **snippet removed** [P: [9to5Google 2025-11-28](https://9to5google.com/2025/11/28/google-messages-link-previews/)] | — | — |

### A.2 Rules that follow, for Blend'n

**1. Use one image for every platform.**
- 1200×630 (1.91:1) satisfies Meta, WhatsApp, iMessage (≥900 wide), LinkedIn (≥1200×627) and Telegram.
- X shows it at 2:1, which trims ~15 px top and bottom. Keep text out of the top and bottom 32 px.

**2. Keep the middle square self-sufficient.**
- Put the identity of the card in the **center 630×630** (x 285–915).
- WhatsApp's occasional square crop [P], Telegram's small thumbnail and iMessage's icon fallback all land there.

**3. Use JPEG with an explicit size.**
- Target ≤200 KB, hard ceiling 300 KB.
- Always emit `og:image:width`, `og:image:height`, `og:image:type` and `og:image:alt`. Meta renders immediately when it knows the dimensions [V].

**4. `og:title` carries the title. Do not repeat it inside a covered card.**
- Apple says avoid text in large preview images [V].
- WhatsApp, iMessage, Telegram and Google Messages all print the title under the image.
- The no-cover card is the exception, where the title *is* the image.

**5. Put date, time and place in `og:description`, in ≤80 characters [V].**
- Google Messages dropped the snippet [P]. That is acceptable, because the date is also inside the card.

**6. `og:url` and canonical are always the bare `/e/<uuid>`.** No `utm`, no share tokens [V: WhatsApp rule].

**7. The text we put in the message must stand alone.**
- WhatsApp users can turn previews off [P], and Google Messages hides the URL [P].
- Format: first line `Neon Nights · Sat 4 Oct, 9 PM`, second line `Toit, Indiranagar`, third line the URL.

**8. Never block preview crawlers.**
- Do not put bot challenges in front of `/e` or `/v`.
- [M] BookMyShow returned **403 to WhatsApp, Twitterbot and Chrome UAs** from here, which is what a blocked crawler sees. Whatever they show is UNVERIFIED.

**9. Bust caches with a versioned image URL.**
- Use `/e/<id>/og/<version>.jpg`, as Meta advises: new image, new URL [V].
- When a WhatsApp preview was broken at send time, re-sharing the link (optionally with `?v=2`, as [Luma suggests](https://help.luma.com/p/updating-social-images)) makes the sender's phone fetch again.

### A.3 Exact `<head>` for `/e/<uuid>` (public, published)

```html
<title>Neon Nights · Sat 4 Oct · Toit, Indiranagar</title>
<meta name="description" content="Sat 4 Oct · 9 PM · Toit, Indiranagar · 18+">
<link rel="canonical" href="https://www.blendn.app/e/3f2a…">
<meta property="og:site_name" content="Blend'n">
<meta property="og:type" content="website">
<meta property="og:title" content="Neon Nights">
<meta property="og:description" content="Sat 4 Oct · 9 PM · Toit, Indiranagar · 18+">
<meta property="og:url" content="https://www.blendn.app/e/3f2a…">
<meta property="og:image" content="https://www.blendn.app/e/3f2a…/og/9c1e7b.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Neon Nights — Saturday 4 October, 9 PM, Toit Indiranagar">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:label1" content="When"><meta name="twitter:data1" content="Sat 4 Oct, 9 PM">
<meta name="twitter:label2" content="Where"><meta name="twitter:data2" content="Toit, Indiranagar">
<meta name="theme-color" content="#0D0C0C">
<meta name="apple-itunes-app" content="app-id=<APPLE_ID>, app-argument=https://www.blendn.app/e/3f2a…">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script type="application/ld+json">{ "@type": "Event", … }</script>
```

Notes on the head:
- The `twitter:label/data` pairs copy what Eventbrite emits today: `label1=Where`, `label2=When` [M].
- The Smart App Banner should only be added once the app is live on the App Store. Store status is UNVERIFIED (the team memory says TestFlight).
- The JSON-LD block is for public events only. Google requires `name`, `startDate`, `location{name,address}` and recommends `eventStatus` (including `EventCancelled`), `image`, `organizer` and `offers` [V: [Google](https://developers.google.com/search/docs/appearance/structured-data/event)].
- `og:type=events.event` (Eventbrite [M]) is not in the core OGP vocabulary. `website` is the safe value. UNVERIFIED whether any messenger treats the two differently.

### A.4 Legibility at thumbnail scale (computed)

The width of the preview image in a WhatsApp bubble on a 360–412 dp Android phone is assumed to be ~250–290 dp. That is UNVERIFIED: no platform publishes it. Taking 270 dp:

- **1 px on a 1200-wide card ≈ 0.225 dp** [M].
- In square-thumbnail mode (~64 dp for the 630-px square), **1 px ≈ 0.10 dp** [M].

| Card px | Large preview (dp) | Square thumbnail (dp) | Use |
|---|---|---|---|
| 44 | 9.9 | 4.4 | Never smaller than this |
| 48 | 10.8 | 4.8 | Secondary text (venue, time) |
| 64 | 14.4 | 6.4 | Body |
| 84 | 18.9 | 8.4 | Title on no-cover cards |
| 120–150 | 27–34 | 12–15 | Date numerals and the monogram: the only things legible as a thumbnail |

On a 1080-wide story viewed at ~400 dp, 1 px ≈ 0.37 dp [M]. So 48 px ≈ 18 dp and 88 px ≈ 33 dp.

### A.5 Dark or light card in chat bubbles

**Recommendation: dark**, `#0D0C0C`, for every card.

Reasons:
1. The app is dark-only, and the card is the first thing a non-user sees. It should look like where they will land.
2. In WhatsApp's light theme a dark card reads as a poster, a high-contrast object among text bubbles. In dark theme it sits flush and the bubble frames it.
3. Today's light cream cards [M] read as generic SaaS, and the left-text layout fails the square crop.

Evidence on what share of Indian WhatsApp users run dark mode: none found (UNVERIFIED).

**Contrast on `#0D0C0C`** [M]:

| Colour | Ratio | Allowed use |
|---|---|---|
| White | 19.5:1 | Any text |
| `#B8B2AC` | 9.3:1 | Secondary text |
| Orange `#F05423` | 5.58:1 | OK at any size |
| Violet `#925DA9` | **4.06:1** | Large text or decoration only |
| White on orange | **3.5:1** | Fails AA for small text. Put dark text on orange chips (5.58:1) |

Add a 2 px inner border at 8 % white so the card edge survives on dark chat wallpapers. This is a design judgement.

---

## B. Dynamic OG images

### B.1 What competitors put in their cards (curl with a WhatsApp UA, 2026-10-03 [M])

| Product | `og:image` | `og:title` / description | Shows | Hides | App hooks |
|---|---|---|---|---|---|
| **Luma** | **Generated** 800×420 JPEG, 33 KB. Wordmark, title, "RSVP" pill on a colour taken from the cover; square cover on the right. Luma states it "generates it … from your event's cover image and name … colors are picked from the cover photo's palette" [V: [help](https://help.luma.com/p/updating-social-images)] | `<title> · Luma` / event description | Title and cover | Date, host, guests (in the card) | `apple-itunes-app` with `app-argument=luma://event/evt-…` |
| | | | | The **public page** shows "80 Going" plus featured guests (`show_guest_list:true`). This is the anti-pattern for Blend'n | |
| **Partiful** | The host's raw poster, `?w=400&h=400&fit=clip` (square) | `<title> \| Partiful` / description | Poster | Date and guests are not in the OG. Hosts can hide the guest list and the "# Going" count [V: [help](https://help.partiful.com/en-us/articles/15525441-can-i-hide-the-guest-list-or-guest-count-on-the-party-page)] | `apple-itunes-app` with an **App Clip** |
| **Eventbrite** | Organiser banner cropped 940×470 (2:1) | Title / description | Banner | Attendees | `twitter:label1 Where` + address, `label2 When` + date. `twitter:app:url:*` deep links carry a referrer param |
| **DICE** | imgix crop of a square poster to 1200×630 (`rect=0,216,1080,648`). **The crop cut off the artist name**: only "JW Marriott Prestige / March 15" survives [M, viewed] | Title + date + venue + "\| DICE" | Crop of the poster | Attendees | `al:ios/android` App Links, `apple-itunes-app` with an https `app-argument` |
| **District (Zomato)** | Organiser horizontal cover. Declares 658×360, actually serves **1600×900, 244 KB** [M] | Title / "Buy Tickets for …!" | Cover | Attendees | — |
| **BookMyShow** | UNVERIFIED (403) | — | — | — | — |
| **Airbnb** | Listing photo, 720 w, no text | "Apartment in … · ★4.94 · 1 bedroom" | Place | **Host identity** | `twitter:app:*` |
| **Spotify** | Square 640×640 artwork, `twitter:card=summary` | Title / "Artist · Album · Song · 1987" | Art | — | The IG Stories share has a "Play on Spotify" link [V: [Spotify](https://artists.spotify.com/blog/we've-made-it-easier-to-share-spotify-to-instagram-stories)] |
| **Apple Invites** | Not fetched | — | Background, title | **The host chooses what is in the preview**, "like the event background or a home address" [V: [Apple newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)]. "Anyone with the link can view and join" unless the host turns on Approve Guests [V: [Apple support](https://support.apple.com/guide/apple-invites/invite-guests-dev851dd16db/ios)] | Web RSVP without an Apple Account [V] |

**What the field converges on:**
- The cover or poster is the image.
- Title and date go in text.
- **Nobody puts attendee faces or counts in the card.**
- Only Luma *generates* a branded card; DICE's naive crop shows why.

**What Blend'n takes from this:**
- Contain a poster; never crop it to 1.91:1. A square poster sits in the center square.
- Add a branded date block on the wings.
- Never show counts, on the card or on the page.

### B.2 Next.js 16 `opengraph-image` / `ImageResponse` constraints

**The file convention:**
- `opengraph-image.tsx` in a route segment default-exports a function that returns a `Response`.
- It exports `alt`, `size` and `contentType`. `params` is a Promise in v16.
- It is "statically optimized … unless they use Request-time APIs or uncached data."
- Next caps image files at 8 MB (og) and 5 MB (twitter) [V: [Next docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)].
- Returning a JPEG `Response` (rather than `ImageResponse`) is allowed, because the function just returns a `Response` [V, same page].

**The renderer is Satori plus Resvg, and it outputs PNG** [V: [Vercel OG](https://vercel.com/docs/og-image-generation)]. Limits:
- **Layout:** flexbox and absolute positioning only; no grid [V].
- **Fonts:** TTF, OTF and WOFF only; **"WOFF2 is not supported"** [V: [Satori README](https://github.com/vercel/satori)].
- **Size:** a 500 KB bundle limit [V]. That limit is about Vercel's function bundles. On Railway with Node it should not apply (UNVERIFIED).
- **What Satori supports:**
  - `backgroundImage` linear and radial gradients
  - `backgroundClip: text`, so a gradient-filled monogram or word is possible
  - masks, `filter: blur()` and others, `objectFit`/`objectPosition`, `opacity`
  - `lineClamp`, `textOverflow: ellipsis`
  - `fontFeatureSettings` (HarfBuzz)
- **What it does not:**
  - **No `z-index`.** Later elements paint on top.
  - **No RTL/bidi.**
  - Emoji need `loadAdditionalAsset` [V: Satori README].

**PNG versus JPEG** [M]: a 1200×630 photo-backed card encodes as PNG 928 KB, JPEG q82 118 KB, JPEG q70 79 KB, WebP q80 78 KB.
- The PNG breaks WhatsApp's official 600 KB limit.
- So: `ImageResponse` → `arrayBuffer` → `sharp(...).jpeg({ quality: 82, progressive: true, mozjpeg: true })`.
- `sharp` 0.35.4 is in admin `node_modules` [C]. It is UNVERIFIED whether that is a direct dependency or only Next's optional one; make it direct.
- Avoid WebP: LinkedIn reportedly does not accept it [P: [previewog](https://previewog.com/fix-linkedin-preview/)].

**Fonts and their licences:**
- **Satoshi** (ITF FFL v2.0, 17 Aug 2026, in today's download) [V: `FFL.txt`]:
  - Allowed: "use the Font Software in any media, including … Digital Images", "self-host … on your own servers … for use on your own websites and applications", "create … images".
  - Forbidden: making it "available to any other person … through … repository … publicly accessible servers".
  - Consequences:
    1. Rendering our own OG cards with it is fine.
    2. It must not sit in the **public** admin repo, where it sits today [C].
  - **Load Satoshi OTF at boot from the private Tigris bucket** (`TIGRIS_PRIVATE_BUCKET`, already part of the env set) and keep it in memory. Satori cannot read the committed woff2 anyway.
- **Geist Mono** is SIL OFL 1.1 [V: [geist-font LICENSE](https://github.com/vercel/geist-font)]. It is fine to commit.

**Indic text:**
- Eventbrite's own Bengaluru address field contains Devanagari ("L-158 5th मेन मार्ग") [M].
- Titles and venue names will sometimes be Kannada or Hindi. Satoshi's coverage is assumed to be Latin-only (UNVERIFIED).
- Pass Noto Sans Kannada and Noto Sans Devanagari (OFL) as fallback fonts through `loadAdditionalAsset`, so no glyph renders as tofu.

**Metadata streaming:**
- Since 15.2, Next streams `generateMetadata` output *after* the shell for user agents that are not on `htmlLimitedBots` [V: [docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots)].
- The default regex in our `node_modules` [C] includes `WhatsApp`, `facebookexternalhit`, `Twitterbot`, `LinkedInBot`, `Slackbot`, `Discordbot` and `applebot`.
- It does **not** name Telegram, or whatever Google Messages and iMessage send (UNVERIFIED UAs).
- Apple requires metadata in the page, with no JS [V].
- **Set `htmlLimitedBots: /.*/`.** That makes metadata blocking for everyone, which is what the docs say to do "to fully disable streaming metadata".
  - Its cost to the dashboard is unmeasured (UNVERIFIED that it matters).

**Caching, with no CDN on Railway:**
- Serve via the Vercel proxy (§D.2). Vercel "honors `cache-control`, `CDN-Cache-Control` … on external rewrites."
  - That is the default for projects created on or after 2026-04-06.
  - Older projects opt in with `x-vercel-enable-rewrite-caching: 1` [V: [Vercel rewrites](https://vercel.com/docs/routing/rewrites)].
- Image URLs are versioned (`/e/<id>/og/<v>.jpg`, with `v` = a short hash of title, start, venue, cover URL and status). Serve them with `Cache-Control: public, max-age=31536000, immutable`.
- HTML gets `s-maxage=300, stale-while-revalidate=86400`.
- WhatsApp's crawler has short timeouts; practitioners target TTFB under 800 ms [P]. Render on request, cache at the edge, and **measure p95**. Move to render-on-write (store the JPEG in the public bucket) only if the cold render exceeds ~800 ms.

### B.3 Per-event template inputs

The card reads exactly these and nothing else:
- `title`
- `start_time` and `timezone` (rendered in IST)
- `venue_name`, or the venue's name and city
- `cover_image_url`
- `min_age` ≥ 18 shows an "18+" chip
- `status` (for the cancelled ribbon)
- `visibility`

**Never read** RSVP, check-in or capacity tables when rendering. That makes the "no counts" rule structural, not a matter of discipline.

---

## C. App-side share UX

### C.1 Platform facts

**iOS share sheet:**
- RN `Share.share` passes `message` and `url`. **`url` is iOS-only** [V: [RN docs source](https://raw.githubusercontent.com/facebook/react-native-website/main/docs/share.md)].
- `LPLinkMetadata` (title, icon, image) is what the share sheet header shows, provided through `activityViewControllerLinkMetadata` [V: [LinkPresentation](https://developer.apple.com/documentation/linkpresentation)].
- `react-native-share` (v12.3.1) implements it. It has a `linkMetadata` option, and otherwise fetches with `LPMetadataProvider` (`ios/RNShareActivityItemSource.m`) [C, library source].
- UNVERIFIED: whether a bare `NSURL` item, as RN's own `Share` passes it, auto-fetches metadata for the header.

**Android Sharesheet:**
- From Android 10, the text preview uses `EXTRA_TITLE` plus a `ClipData` thumbnail.
- From Android 14, apps can add `ChooserAction`s (`EXTRA_CHOOSER_CUSTOM_ACTIONS`).
- The guidance says "Use the Android Sharesheet" and "**Do not build custom Sharesheet variations**" [V: [Android](https://developer.android.com/training/sharing/send)].
- **Neither** RN `Share` (it sets `EXTRA_SUBJECT`) **nor** `react-native-share` (also `EXTRA_SUBJECT`, and `ClipData` only for files) sets `EXTRA_TITLE` or a thumbnail [C, sources].
- A rich Android preview would need a ~40-line Expo module. Skip it: our tray shows the card instead.

**Apple HIG on activity views:**
- "Avoid creating duplicate versions of common actions that are already available in the activity view."
- "Use the Share button to display an activity view."
- Source: [V: HIG Activity views](https://developer.apple.com/design/human-interface-guidelines/activity-views).

**Instagram Stories:**
- **A Facebook App ID has been required since January 2023** (`source_application`).
- iOS uses `instagram-stories://share?source_application=<id>` with the pasteboard keys `…backgroundImage`, `…stickerImage`, `…backgroundTopColor` and `…backgroundBottomColor`. It needs `instagram-stories` in `LSApplicationQueriesSchemes`.
- Android uses the intent `com.instagram.share.ADD_TO_STORY` with `interactive_asset_uri` and top/bottom colours, as a content URI with read permission.
- Assets:
  - Background: JPG/PNG, min 720×1280, 9:16 or 9:18.
  - Sticker: 640×480 recommended.
  - Video: ≤20 s.
- Source for all of the above: [V: [Meta](https://developers.facebook.com/docs/instagram-platform/sharing-to-stories)].
- **Meta's public docs no longer mention an attribution or content link.** `react-native-share` labels `attributionURL` "facebook beta-test" [C, docs]. Treat a tappable "Open in Blend'n" link as **not available** (UNVERIFIED whether it is partner-only).
- Users can add a **Link sticker** themselves: available to all accounts since 2021-10-27 [V: [Instagram](https://about.instagram.com/blog/announcements/expanding-sharing-links-in-stories-to-everyone)].
- `react-native-share` supports `INSTAGRAM_STORIES` on iOS and Android, plus `WHATSAPP`, and ships an Expo config plugin for `LSApplicationQueriesSchemes` and Android `<queries>` [C, repo].

**WhatsApp direct:**
- `https://wa.me/?text=<urlencoded>` opens WhatsApp with a pre-filled message and a contact picker. This is documented in WhatsApp's click-to-chat FAQ [P: the FAQ page is JS-rendered; confirmed via [secondary](https://forum.freecodecamp.org/t/whatsapp-click-to-chat-link-to-include-page-title-and-url-in-pre-filled-message/339727)].
- `Linking.openURL` needs no library.
- WhatsApp Status has no public share API. Sharing an image file through the system sheet lets the user pick "My status" (UNVERIFIED as a guaranteed target).

**Files:**
- `expo-sharing` shares local files, with `mimeType` on Android and `UTI` on iOS [V: [Expo](https://docs.expo.dev/versions/latest/sdk/sharing/)].
- `expo-file-system` and `expo-clipboard` are already installed [C].

### C.2 Custom tray or system sheet: the call

Use **one small custom tray** on both platforms (the same component). It appears when the user taps Share on something shareable.

```
┌──────────────────────────────────────────┐
│  [ card preview — the actual OG JPEG ]   │  ← "This is what they'll see"
│  Neon Nights                             │
│  Sat 4 Oct · 9 PM · Toit                 │
├──────────────────────────────────────────┤
│ (WhatsApp)  (Instagram Story)  (Copy link)  (More…) │
└──────────────────────────────────────────┘
```

Why a tray rather than only the system sheet:
1. **The Instagram Story path cannot exist inside the system sheet.** It needs our 9:16 asset.
2. **The preview is a privacy feature.** The user sees exactly what leaves the app.
3. **WhatsApp should be one tap** in India.

How it stays inside platform guidance:
- It does not replicate system targets. There are no home-made Messages, Gmail or Telegram icons.
- "More…" hands off to the real system sheet: RN `Share` with `url` on iOS, and the link inside `message` on Android.

Haptics and motion for the tray follow `research-haptics-motion.md`.

Action behaviour:

| Action | Implementation | Payload |
|---|---|---|
| WhatsApp | `Linking.openURL('https://wa.me/?text='+enc(text))`. Fall back to "More…" on error | The standalone 3-line text with the URL (§A.2 rule 7) |
| Instagram Story | **v1:** download `/e/<id>/story/<v>.jpg` (1080×1920) and share it as a file through "More…"; the user picks Instagram or WhatsApp Status. **v2:** `react-native-share` `INSTAGRAM_STORIES` with the FB App ID, a sticker and `#0D0C0C` colours | The image. **Before opening Instagram, copy the URL to the clipboard and toast "Link copied — add it with the Link sticker".** |
| Copy link | `expo-clipboard` | URL only |
| More… | System sheet | iOS: `message` = 2-line text, `url` = link. Android: 3-line text |

### C.3 What can and cannot be shared

**Shareable:**

| Thing | Link | Card | Entry points |
|---|---|---|---|
| Event (`public` or `unlisted`, published, not past) | `/e/<uuid>` | Event card | Event detail header (share icon, top-right); the action row after RSVP ("Bring someone?" sheet, WhatsApp first — the highest-intent moment); Going tab row overflow (already exists) |
| Venue (active) | `/v/<uuid>` | Venue card | Venue page header |
| Friend invite | `/f/<token>` (exists) | Invite card | Profile / Friends → "Invite a friend" (exists, `useFriendInvite`) |
| Your own monthly recap | Image only, **no link to any person** | Recap story card | Recap screen, one card at a time |

**Never shareable.** Hide the share affordance entirely on these, and do not just disable it:
- People and profiles, including your own pseudonymous profile
- Matches, reveals, crews, crew presence ("we're here")
- Rooms and messages, board posts
- Check-ins, live venue presence and live buckets
- Who is going
- Private events: no share icon. Organisers invite through the product.

**Never generate "I'm here" content.**
- No share prompt is triggered by check-in.
- The story card says nothing like "I'm going" by default. An opt-in toggle "Say I'm going" can exist, default off.
- Sharing your own future location publicly is the user's call, but the default must not do it.

### C.4 Story card and monthly recap

**Event story card (1080×1920):**
- Used for Instagram Stories and WhatsApp Status.
- Layout is in §2.6.
- Rendered server-side by the same Satori module, so fonts and templates live in one place and no `react-native-view-shot` dependency is needed.

**Monthly recap ("your September on Blend'n"):**
- Private by default.
- The share flow previews the exact card.
- Rules:
  - **Only your own aggregates**, as counts: nights out, venues, neighbourhoods. Optionally your own connections count, **off by default** because it reads as dating stats.
  - **No people, ever:** no names, creatures, crews or "top person".
  - **No venue names and no dates or weekdays by default.** "Every Friday at Toit" is a stalking pattern. A per-card toggle "Show top venue" is allowed, default off.
  - **Delay:** recaps cover complete past months only and are published on the 1st. They never cover the current week.
  - Spotify's Wrapped is the reference for format (9:16, one share button per card) [V: [Spotify newsroom](https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/)]. Spotify publishes no per-item privacy toggles [V, same page]. Ours is the stricter version.

---

## D. Deep linking

### D.1 Facts

**Universal links:**
- The AASA is served at `/.well-known/apple-app-site-association`, HTTPS only, with **no redirects**. It uses `applinks.details[].components` (`"/"`, `"?"`, `"#"`, `exclude`).
- Since iOS 14, devices fetch it from **Apple's CDN**: within 24 h, then roughly weekly. `?mode=developer` bypasses the CDN [V: [Apple](https://developer.apple.com/documentation/xcode/supporting-associated-domains)].
- Expo sets `ios.associatedDomains` [V: [Expo](https://docs.expo.dev/linking/ios-universal-links/)].
- Vercel cannot rewrite `/.well-known`, so the AASA stays on the landing project [V: Vercel rewrites].

**Android App Links:**
- Intent filters with `autoVerify` and `pathPrefix`, plus `assetlinks.json` carrying the **Play App Signing** fingerprint.
- Verification can take 20 s or more [V: [Expo](https://docs.expo.dev/linking/android-app-links/)].
- A change to the intent filter needs a **new native build**; an OTA update cannot deliver it (inference from it being manifest config).

**Expo Router:**
- `+native-intent.tsx` exports `redirectSystemPath({ path, initial })` to rewrite incoming links. It is native-only and has no auth context [V: [Expo](https://docs.expo.dev/router/advanced/native-intent/)].

**Smart App Banner:**
- `<meta name="apple-itunes-app" content="app-id=…, app-argument=…">`.
- Safari only. Not in iframes, not on the simulator. It does not come back once dismissed [V: [Apple](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)].
- Android has no equivalent. Chrome's `related_applications` prompt is for installable web apps [P: [Chrome](https://developer.chrome.com/blog/app-install-banners-native)], and we would need a PWA manifest. Use our own sticky bar instead.

**Android `intent:` URLs:**
- `intent://…#Intent;scheme=https;package=…;S.browser_fallback_url=…;end`.
- They need a **user gesture** and a BROWSABLE activity [V: [Chrome](https://developer.chrome.com/docs/android/intents)].

**Firebase Dynamic Links shut down on 2025-08-25.**
- Links now return 404.
- Google points to App Links and Universal Links for installed apps, and to Adjust, Airbridge, AppsFlyer, Bitly, Branch, Kochava and Singular for parity [V: [FAQ](https://firebase.google.com/support/dynamic-links-faq)].

**Deferred deep links:**
- **Android:** the Play Install Referrer returns the `&referrer=` string passed to the Play URL, available for 90 days. Call it once on first run [V: [Android](https://developer.android.com/google/play/installreferrer/library)].
  - `expo-application.getInstallReferrerAsync()` wraps it [V: [Expo](https://docs.expo.dev/versions/latest/sdk/application/)] and is **already installed** [C].
- **iOS:** there is no native referrer.
  - Clipboard handoff triggers the "Allow Paste" prompt (iOS 16+) [P: [MacRumors](https://www.macrumors.com/2022/10/17/ios-16-1-paste-from-other-apps-settings/)].
  - Fingerprinting is not allowed (Apple's ATT rules; [P: tolinku](https://tolinku.com/blog/ios-paste-permission-deferred-links/)).

### D.2 Recommendation for Blend'n

**URL scheme:**
- `https://www.blendn.app/e/<event-uuid>`
- `https://www.blendn.app/v/<venue-uuid>`
- `https://www.blendn.app/f/<token>` (unchanged)

Use UUIDs, not `slug`, because `slug` is the guessable `slugify(title)` [C] and leaks the title. UUIDs are 36 characters. A shorter base62 encoding is cosmetic; skip it until someone asks.

**Hosting:**
- The pages are rendered by the **admin Next.js server** under `/share/e/[id]` and `/share/v/[id]`, next to the DB and fonts.
- They are proxied by the landing project's `vercel.json`, before `{"handle":"filesystem"}`. That file uses legacy `routes`, so this is a `routes` entry with an external `dest`:
  ```json
  { "src": "^/(e|v)/([^/]+)(/.*)?$", "dest": "https://<admin-host>/share/$1/$2$3" }
  ```
- Add `x-vercel-enable-rewrite-caching: 1` if the project predates 2026-04-06 [V].
- Optionally add the `x-origin-secret` transform from Vercel's docs, so the origin rejects direct hits [V].
- *Alternative:* Vercel Functions inside the landing project that call the public API. More moving parts and no DB; rejected.

**App changes** (one native release):
- AASA components gain `{"/":"/e/*"}` and `{"/":"/v/*"}`.
- Android `intentFilters` gain `pathPrefix "/e/"` and `"/v/"` with `autoVerify`.
- `+native-intent.tsx` maps `/e/:id` → `/event/:id` and `/v/:id` → `/venue/:id`. It falls back to `/` on anything unparseable, because it must not throw [V].

**Deferred:**
- **Android:** the page's "Get it on Google Play" button links to
  `https://play.google.com/store/apps/details?id=com.matryxsociallabs.blendn&referrer=` followed by the URL-encoded `e=<uuid>&utm_source=share_page`.
  On first launch the app calls `getInstallReferrerAsync()` once and, after onboarding, routes to the event.
- **iOS:** none in v1. iOS is ~7 % of traffic.
- **Revisit Branch or AppsFlyer** only if iOS share-to-install volume justifies an SDK. They carry fingerprinting and privacy-policy implications under DPDP (§E).

**"Open in app" on the page:**
- Android: an `intent:` URL with `S.browser_fallback_url` set to the Play URL above, on a button tap.
- iOS: the Smart Banner, plus a button to `blendn://event/<id>` that falls back to the App Store.
- UNVERIFIED: iOS opening a universal link to the same domain from a page already on that domain may stay in Safari. Hence the custom-scheme button.
- UNVERIFIED: in-app browsers (Instagram's especially) often do not hand App Links to the app. Show the bar regardless.

### D.3 The web landing: `/e/<uuid>`

**States:**

| State | Page | Card / OG | Robots | HTTP |
|---|---|---|---|---|
| Published + public | Full public info | Event card | index | 200 |
| Published + unlisted | Full public info, **area only, no street address** (Apple Invites precedent: the host decides whether the address goes in the preview [V]) | Event card, without the address | **noindex** | 200 |
| Private | "An invite-only event on Blend'n. Open the app to see it if you're invited." **No title, date or venue.** | Generic app card | noindex | 200 (the same body for any private id) |
| Cancelled | Full info plus a "Cancelled" ribbon | Card with "CANCELLED" over the date block; `og:title` "Cancelled: …"; JSON-LD `EventCancelled` | as visibility | 200 |
| Ended (`completed` or past `end_time`) | "This event has ended", plus the venue's upcoming public events | Card unchanged (old chats keep it anyway) | as visibility | 200 |
| Draft, deleted, suspended organiser, or unknown id | "This event isn't available", plus the app CTA. **Identical for all four**, so it cannot be used to test whether an id exists | App card | noindex | 404 |

**Content order (mobile-first, dark):**
1. Cover, *contained* (never cropped), in the cover's aspect ratio up to 4:5.
2. Title in Satoshi Bold.
3. Date and time in Geist Mono: `SAT 04 OCT · 9:00 PM IST`.
4. Venue name and area, with a link to `/v/<id>` when `venue_id` is set.
5. "18+" chip, and price in ₹ (Geist Mono) if the product carries one.
6. Organiser name. Organisers are public entities per the product rulings; confirm the "labels-only hosts" ruling before showing it.
7. `short_description`.
8. Primary CTA **"Open in Blend'n"**. Secondary: **Get it on Google Play**, then App Store. Play goes first because ~93 % of traffic is Android.
9. One line of value: "See who's into it — privately — in the app." **No numbers.**

**Never on the page:**
- Going or checked-in counts or lists
- Live buckets
- Chat or rooms, crews
- Any avatar or creature
- The organiser's people (staff and team members)

**Venue page `/v/<uuid>`:**
- Name, `venue_type`, area and city, address.
- Upcoming **public** events as cards linking to `/e/…`.
- The open-in-app CTA.
- **No live data at all on the web**, not even buckets. An unauthenticated page can be polled to build an occupancy timeline of a nightlife venue. Buckets stay in-app, behind auth.

**Friend invite page `/f/<token>`:**
- The current static copy is correct. Keep it, dark-redesigned.
- **No inviter identity**: not name, not handle, not creature (see §E.2).
- **No validity check on the web.** The app validates the token. That avoids a token oracle and keeps the response identical for every token.
- Headers: `noindex`, `Referrer-Policy: no-referrer`. The token sits in the path, so it must not leak to the stores or the CDN via `Referer`.

---

## E. Privacy in sharing

### E.1 Never in a card, a link or a share page

1. **Who is going or who is there.** No faces, creatures, names or "your friends are going".
2. **Counts of people**: going, live, capacity remaining.
   - Reason one: the card is frozen at send time [P: Mysk], so a count is wrong within minutes.
   - Reason two: in a small group, "3 going" together with the sender implies who the others are.
   - Reason three: occupancy over time is surveillance of a venue.
3. **Live data and buckets.** Not in cards, not on web pages.
4. **The sharer's identity**, pseudonymous or real.
   - In WhatsApp the recipient already knows the sender's phone identity.
   - Adding the sender's Blend'n creature or handle **links the pseudonym to a real person** for everyone the link is forwarded to.
5. **Any user identifier in the URL** (`?ref=<handle>`, a user id). WhatsApp itself asks for an undecorated `og:url` [V]. Links get forwarded into groups and fetched by third-party servers: Google [V], Meta [P].
6. **Private-event details**, for anyone who is not invited. The card cannot know who is asking, because crawlers are anonymous.
7. **Check-ins and location**, including the user's own, by default.

### E.2 Referral attribution without exposing people

**v1: no per-user tokens.**
- Measure aggregate funnels: `/e` page views counted server-side, store clicks, and installs carrying `utm_source=share_page` through the Play referrer.
- That answers "does sharing grow the app" without touching anyone's data.

**When referral rewards ship:**
- Use an opaque random share id that maps server-side to (sharer, event).
- Never derive it from user ids, never display it, and expire it after 30 days.
- Tell the sharer only aggregates above a threshold ("3+ people joined from your links"). **Never who.**
- Never tell the recipient who shared.

**Friend invite tokens:**
- They are capabilities, and personal data, because they link back to the inviter.
- Expire them on use or after N days. DPDP s.8(7) requires erasure "as soon as it is reasonable to assume that the specified purpose is no longer being served" [V: [s.8](https://www.dpdpa.com/dpdpa2023/chapter-2/section8.html)].

### E.3 India DPDP

**Statute:**
- Consent must be "limited to such personal data as is necessary for such specified purpose" (s.6(1)) [V: [s.6](https://www.dpdpa.com/dpdpa2023/chapter-2/section6.html)].
- Security safeguards: s.8(5). Erasure when the purpose is served: s.8(7) [V].
- For children (<18): verifiable parental consent, and a **flat ban** on "tracking or behavioural monitoring of children or targeted advertising directed at children" (s.9(3)) [V: [s.9](https://www.dpdpa.com/dpdpa2023/chapter-2/section9.html)].

**Rules 2025** (notified 14 Nov 2025 [V: [PIB](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)]):
- 18-month phased compliance.
- An itemised, plain-language consent notice. Rights requests answered within 90 days [V: PIB].
- Phase dates [P: [dcomply](https://dpdpa.dcomply.in/rules/)]:
  - Rule 4 (consent managers): 14 Nov 2026.
  - Rules 3, 5–16 (notice, security, breach, retention, children): 14 May 2027.
  - A proposed acceleration to 13 Nov 2026 is UNVERIFIED and not notified.

**What that means for sharing:**
- **The `/e`, `/v` and `/f` pages are visited by non-users, possibly minors.**
  - No third-party pixels or analytics SDKs, no cookies, no fingerprinting.
  - Then no "tracking or behavioural monitoring" happens (s.9(3)), and there is no consent surface to build.
  - Vercel forwards `x-real-ip` and `x-forwarded-for` [V]. Don't persist them for share routes beyond short-lived operational logs.
- **Server logs** of visitor IPs are personal data on a conservative reading (UNVERIFIED legally; confirm with counsel). Keep retention short.
- **The sender-side preview fetch** hits our server with the sender's IP [P: Mysk]. Treat it like any other log line. Never join it to the account.
- **The recap** is processed for the user's own view, which is within purpose. Sharing it is the user's own act. Defaults are minimal (§C.4).
- **Push payloads** pass through Apple and Google. Keep message-request bodies and anything sensitive out of them: s.8(5), plus Apple's HIG on avoiding private info [V: HIG notifications, via `research-notifications.md`].

---

## F. Rich push: visuals

Copy, levels and channels are in `research-notifications.md` §8.7–8.8. This section adds icons, colour, images, avatars and actions.

### F.1 Platform capability

**iOS:**
- **Interruption levels** [V: [Apple](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel)]:
  - passive: "without lighting up the screen or playing a sound"
  - active
  - timeSensitive: "breaks through system notification controls"
  - critical
- HIG: use Time Sensitive "only for notifications that are relevant in the moment … happening now or will happen within an hour". **Never for marketing** [V, via [HIG mirror](https://github.com/incrediblecrab/apple-os-documentation/blob/main/human-interface-guidelines/patterns/managing-notifications.md)].
- Time Sensitive needs the entitlement `com.apple.developer.usernotifications.time-sensitive` [P: [b4x](https://www.b4x.com/android/forum/threads/usernotificationcenter-class-time-sensitive-notifications.161573/)].
- **Communication notifications:**
  - They need the Communication Notifications capability, `INSendMessageIntent` in `NSUserActivityTypes`, an `INPerson` whose "image … becomes the avatar", and `content.updating(from:)` inside the **Notification Service Extension**.
  - They "break through the scheduled notification summary by default, and can also break through a Focus" [V: [Apple](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications)].
  - Entitlement: `com.apple.developer.usernotifications.communication` [P: [Expo capabilities](https://docs.expo.dev/build-reference/ios-capabilities/)].
- **Attachments:** images (JPEG, GIF, PNG) ≤**10 MB**. Options include `ThumbnailClippingRectKey` and `ThumbnailHiddenKey` [V: [Apple](https://developer.apple.com/documentation/usernotifications/unnotificationattachment)].
- **Service extension:** needs `mutable-content: 1` and a visible alert. It has **~30 s**. On timeout the original content is shown [V: [Apple](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications)].
- **HIG:** up to **four** action buttons. Short, title-case labels with no app name. Destructive actions need context. Avoid private information [V: [HIG](https://developer.apple.com/design/human-interface-guidelines/notifications)].

**Android:**
- **Anatomy:** the small icon is required.
  - "Large icon … usually used only for contact photos. Don't use it for your app icon" [V: [Android](https://developer.android.com/develop/ui/compose/notifications)].
  - "Large icons must be circular when showing a person, but square in all other cases." Don't "use the large icon for branding" [V: [Android design](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications)].
- **Small icon:** "should only be a white-on-transparent background image", visually simple, no extra alpha [V: [Android design archive](https://webarchive.library.unt.edu/web/20160706094346mp_/https://developer.android.com/design/patterns/notifications.html)].
  - "Starting in Android 12 … the system derives the icon color from the notification color you set" [V: Android design].
- **Actions:** up to **3** (`addAction`) [V: [Android](https://developer.android.com/develop/ui/views/notifications/build-notification)]. Don't add "text actions that duplicate the behavior of tapping on the notification body" [V: Android design].
- **BigPictureStyle:** to show the image as a thumbnail while collapsed, call `setLargeIcon` and `bigLargeIcon(null)` [V: [Android](https://developer.android.com/develop/ui/views/notifications/expanded)].
- **Conversation space** (Android 11+) needs `MessagingStyle`, a **long-lived sharing shortcut** with `Person` data, and the conversation not demoted. "Use conversations ONLY for real-time person-to-person communication" [V: [Android](https://developer.android.com/develop/ui/views/notifications/conversations)].
- **Lock screen:** PUBLIC, PRIVATE (shows app name and icon, with optional safe text such as "2 new messages") or SECRET [V: Android design].

**Expo (SDK 57) support:**

| Capability | Support |
|---|---|
| Push `richContent.image` | "Android will show the image out of the box. On iOS, you need to add a Notification Service Extension" [V: [Expo push fields](https://docs.expo.dev/push-notifications/sending-notifications/)]. Expo's own example PR builds the NSE with `expo-apple-targets` (`npx create-target`) plus Swift, and was **not merged** [C: [expo#36202](https://github.com/expo/expo/pull/36202)]. The same NSE can host communication notifications |
| `interruptionLevel`, `threadId`, `collapseId`, `tag`, `categoryId`, `mutableContent` | All in the push API [V]. `threadId`, `collapseId` and `tag` are already used [C] |
| Categories | `setNotificationCategoryAsync` with action options `opensAppToForeground`, `isDestructive`, `isAuthenticationRequired`, `textInput` [V: SDK 57 API data] |
| Channels | Support `lockscreenVisibility` [V: SDK 57 API data] |
| Icon | Config plugin `icon`: "**96x96 all-white png with transparency**", plus `color` [V: Expo docs] |
| Large icon | A static `largeIcon` config property arrived in **expo-notifications 58.0.0 (2026-09-10)**, which is **not SDK 57** [C: [CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-notifications/CHANGELOG.md)]. It is app-wide, and Android says never to use it for branding, so **don't**. Per-message large icons and `MessagingStyle` are **not available** through Expo push (UNVERIFIED by absence in the docs) |
| Native-style notifications | Notifee was **archived on 2026-04-07** [M: GitHub API]. A maintained fork exists (`react-native-notify-kit`). A custom Expo module is the alternative |

### F.2 Small icon and accent: the asset to draw

**Today's problem** [M]:
- `monogram-white.png` is a monoline outline, 453×534 (not square).
- Its median stroke is 28.5 px on 534 px of height, about **1.3 dp at 24 dp**. Inside the safe area it is thinner still.
- Status-bar glyphs are conventionally ~2 dp strokes (Material convention, UNVERIFIED citation). At 1.3 dp it will shimmer or disappear on low-dpi Android phones, which are common in India.

**Spec:**

| Property | Value |
|---|---|
| Canvas | **96×96 px**, square (Expo), equal to 24 dp at xxxhdpi |
| Live area | 80×80 (2 dp padding each side) |
| Form | The B+N monogram, **simplified**: either a filled silhouette, or the monoline at **≥8 px stroke** (2 dp), with the inner counters opened up so they survive at 18–24 dp |
| Colour | Pure white `#FFFFFF`, alpha 0 or 255 only, no gradients. The system uses only alpha [V] |
| Check | Render at 24, 18 and 16 px on `#0D0C0C` and `#FFFFFF` |

**Accent:**
- `expo-notifications` plugin `color: "#F05423"`, the brand orange (currently `#F05524` [C]).
- Fix the adaptive-icon background and splash colours to brand tokens in the same PR.

**iOS:** the app icon is used automatically. Nothing to draw.

### F.3 Images in push

**Which kinds get an image:**
- **`starts_soon`** (the 60-minute reminder).
- **`waitlist_promoted`** ("you're in").
- Nothing else. Images belong to *your night* moments. On a change or cancellation the text is the point. On people-related pushes an image would expose someone.

**The asset:**
- `/e/<id>/push/<v>.jpg`: the **cover only, no burned-in text** (text is unreadable at thumbnail size).
- 1200×600 (2:1), subject centred, JPEG ≤200 KB.
- Without a cover, send no image. Never send the generated title card.

**Exception:** for **private** events, send no image. A cover on the lock screen tells anyone looking at the phone which event the person is going to. This is a judgement call; the HIG warns against private info on notifications [V].

**iOS:** in the NSE, set `ThumbnailClippingRectKey` to the centre square so the collapsed thumbnail shows the subject [V for the key; the collapsed crop behaviour is UNVERIFIED].

**Android:** BigPicture with `bigLargeIcon(null)`: thumbnail when collapsed, the image when expanded [V]. Expo shows `richContent.image` out of the box [V]. Whether it adds the collapsed thumbnail is UNVERIFIED.

### F.4 Avatars

**v2: DMs (and crew chat, if it is person-to-person) as iOS communication notifications.**
- `INPerson.displayName` = the thread name rule in `research-notifications.md`: the pseudonym until reveal.
- `INPerson.image` = the **creature avatar, always**, even after a reveal. The lock screen is public. A real photo on it is a reveal to everyone nearby.
- Render the creature server-side as a 256×256 PNG on `#0D0C0C`, at a stable URL per creature, so the NSE can fetch it.
- `INPerson` handles use an opaque app id (`blendn:<uuid>`), never a phone number or email.

**Android:** keep the default style in v1. Expo cannot set per-message large icons or `MessagingStyle` [§F.1].
- In v2, a small Expo module would build a `MessagingStyle` notification with a long-lived shortcut and `Person.icon` set to the creature, **circular** as Android requires for people [V].

**No avatar** for match, reveal_request, reveal, message_request, board_*, friend_*. These are not real-time conversations, so Android says not to use conversation treatment [V]. Showing a person's avatar on match or reveal before the user opens the app also defeats the in-app reveal.

### F.5 Visual treatment by kind

Copy and levels come from `research-notifications.md` §8.7. TS = time-sensitive.

| Kind | iOS presentation | Android style | Image | Avatar | Actions |
|---|---|---|---|---|---|
| DM | Standard; communication notification in v2 | Default; MessagingStyle in v2 | — | Creature (v2) | None in v1. "Reply" (`textInput`) in v2 |
| Room reply | Standard; `threadId` per room (exists) | Default | — | — | — |
| message_request | Standard, **no body preview** | Default, channel PRIVATE | — | — | — (accept/decline needs context: open the app) |
| match / reveal_request / reveal | Standard | Default, channel `people` PRIVATE | — | — | **None.** No "Reveal" or "Accept" button: a reveal is consequential and must happen in-app with confirmation |
| friend_request | Standard | Default | — | — | v2: "Accept" (`isAuthenticationRequired: true`). Not "Decline" from the lock screen |
| friend_accepted, board_* | Standard | Default | — | — | — |
| crew_invite / we_are_here / its_a_blend | Standard; `we_are_here` is TS (sibling) | Default, `crew` PRIVATE | — | — | — (no location detail beyond "your crew's here") |
| **starts_soon** | **TS** (within the HIG's "within an hour"; the reminder is at 60 min [C]) | BigPicture | **Cover** (public and unlisted events) | — | "Directions" (opens maps) and "Check in" (deep link straight to the check-in sheet). Both go somewhere other than the tap target, the event page, so they are not duplicates [V rule]. ≤2 actions |
| event_changed / cancelled | A, or TS within 60 min (sibling) | Default | — | — | — |
| announcement | A, never TS (an organiser post can be promotional; the HIG bans TS for marketing [V]) | Default | — | — | — |
| **waitlist_promoted** | A | BigPicture | **Cover** | — | "View" opens the event. That is the tap target, so on Android omit it and keep the tap |
| rating_request | **Passive** | Default, `later` LOW | — | — | — |

**Lock screen, dark mode:**
- iOS and Android render the system material. Our levers are the small icon, the accent and the image.
- Keep cover images from being mostly pure white. They glare on a dark lock screen at 2 AM. This is a judgement call.
- Android channel `lockscreenVisibility` should be **PRIVATE** for `messages`, `people` and `crew`, and PUBLIC for `events`.
  - The existing channels' behaviour is fixed at creation (client comment [C]). New channels are where this can be set; the sibling file's §8.8 already plans that.

---

## 2. Deliverable specs for Claude Design

### 2.1 Shared grid for every 1200×630 card

| Property | Value |
|---|---|
| Canvas | 1200×630, background `#0D0C0C`, 2 px inner border `rgba(255,255,255,.08)` |
| Outer margin | 56 px |
| **Square-safe zone** | **x 285–915** (630×630). Whatever must survive a square crop lives here |
| X 2:1 trim | Keep text out of y 0–32 and y 598–630 |
| Type | Satoshi 700 (titles), Satoshi 500 (secondary), Geist Mono 500 (date, time, ₹, "18+") |
| Minimum text | 48 px |
| Colours | Text `#FFFFFF`; secondary `#B8B2AC`; accent `#F05423` (numerals, rules, chips with **dark** text); violet `#925DA9` only inside the orange→violet gradient (monogram stroke, hairline rules) |
| Output | JPEG q82 progressive, target ≤200 KB, versioned URL |

### 2.2 Event with cover (E1)

```
x: 0        285                        915        1200
   ┌─────────┬──────────────────────────┬─────────┐
   │  SAT    │                          │    ⌗    │  ← monogram 120px, gradient stroke
   │  04     │      COVER  630×630      │         │
   │  OCT    │   (objectFit: cover,     │         │
   │         │    focal centre)         │   18+   │  ← chip, #F05423 bg, #0D0C0C text, 40px
   │  9 PM   │                          │         │
   └─────────┴──────────────────────────┴─────────┘
```

**Left wing:**
- Day: Geist Mono 40 px, orange, tracking +8 %.
- Date numerals: **140 px**, white.
- Month: 40 px.
- Time: 48 px, `#B8B2AC`.
- The stack is vertically centred.

**Centre:**
- The cover, full height, square.
- **If the cover is not square, contain it** on a blurred, darkened copy of itself (`filter: blur(40px) brightness(.4)`) rather than cropping a flyer's headline. This is DICE's failure [M].

**Right wing:** monogram top-right, "18+" bottom-right if `min_age ≥ 18`.

**No title in the image.** `og:title` carries it.

**Cancelled:** a 64 px "CANCELLED" band across the left wing, near-black text on orange, with the date struck through.

### 2.3 Event without cover (E2)

```
   ┌───────────────────────────────────────────────┐
   │        (giant monogram outline, gradient,     │
   │         8% opacity, bleeding off right edge)   │
   │                                               │
   │            SAT 04 OCT · 9 PM                  │  ← Geist Mono 48, orange, centred
   │              Neon Nights at                   │  ← Satoshi 700, 84px, white,
   │               the Rooftop                     │     centred, max 3 lines, ellipsis
   │           Toit · Indiranagar                  │  ← Satoshi 500, 48, #B8B2AC
   │                                               │
   └───────────────────────────────────────────────┘
```

- Text column max-width **560 px**, centred, so the whole block sits inside the square-safe zone.
- At ~22 characters per line × 3 lines, longer titles get an ellipsis.

### 2.4 Venue (V1): no image column exists, so always typographic

- Same structure as E2.
- Eyebrow `VENUE` in Geist Mono 40 px, orange, tracking +12 %.
- Name in Satoshi 700, 84 px.
- `venue_type · area` in 48 px `#B8B2AC`.
- **No live bucket, no counts, no "open now".** These are stale on arrival and surveil the venue (§E.1).
- When venue photos become a column, add a V2 that mirrors E1, with "VENUE" replacing the date block.

### 2.5 Friend invite (F1, dark redesign of the current card) and app default (A1)

**F1:**
- Centred composition. Monogram (gradient stroke) at 160 px tall, centred, top third.
- "You're invited to Blend'n" in Satoshi 700, 84 px, white.
- "A friend wants to add you." in 48 px `#B8B2AC`.
- **The same static file for every token.** No inviter identity.

**A1:** the same layout with "Where events meet serendipity" (the current tagline).

**Both:** static JPEG, ≤150 KB. They replace `og-invite.png` and `og-default.png` on the landing site.

### 2.6 Square fallback (1080×1080) and Instagram Story (1080×1920)

**Square** (share-as-image to WhatsApp chats and Status, and the IG feed):
- Cover at 1080×720 on top, with the same contain-and-blur rule.
- A 360-px band below:
  - date line, Geist Mono 44 px, orange
  - title, Satoshi 700, 72 px, 2 lines
  - venue, 44 px
- Side margins 64.

**Story 1080×1920:**
- Safe zones: top **250**, bottom **340**, sides **64** [P: [Meta-safe-zone summaries](https://www.breakreach.com/guides/instagram-story-size); Meta's own figure is UNVERIFIED].
- y 0–250: background only. Background `#0D0C0C` with a radial bloom (orange→violet, 18 % opacity) behind the card.
- y 280–1232: cover card 952×952, radius 40, contain-and-blur. The no-cover variant uses the E2 composition at this size.
- y 1290: `SAT 04 OCT · 9:00 PM` in Geist Mono 52 px, orange.
- y 1350–1530: title in Satoshi 700, 88 px, white, max 2 lines.
- y 1540: `Toit · Indiranagar` in Satoshi 500, 48 px, `#B8B2AC`.
- y 1580: short URL `blendn.app/e/…` in Geist Mono 36 px, `#B8B2AC`. This is the fallback for people who don't add the Link sticker. Small monogram at left.
- y 1580–1920: keep clear for the **Link sticker** and the reply bar.
- **No "I'm going"** unless the user turned on the toggle (§C.3).

**Recap story:**
- Same safe zones.
- Headline "Your September" in Satoshi 700, 96 px.
- 2–3 stat tiles with Geist Mono numerals at 160 px and 40 px labels ("nights out", "venues", "neighbourhoods").
- Monogram at the foot.
- **No people, no venue names by default, no dates** (§C.4).

### 2.7 Message text that accompanies a share

```
Neon Nights · Sat 4 Oct, 9 PM
Toit, Indiranagar
https://www.blendn.app/e/3f2a…
```

Friend invite: the existing `inviteMessage(url)` [C].

---

## 3. Work this implies (for whoever builds it), smallest first

1. **Client, OTA-able.**
   - Share sends a link with the 3-line text; on iOS, `url` is passed separately.
   - Add the tray (WhatsApp, Copy link, More…).
   - Remove share affordances from non-shareable surfaces.
2. **Admin.**
   - `/share/e/[id]` and `/share/v/[id]` pages.
   - The OG and story image routes: Satori, then sharp to JPEG.
   - Fonts loaded from the private bucket.
   - `htmlLimitedBots: /.*/`.
3. **Landing.**
   - `vercel.json` external routes for `/e/` and `/v/`, with the rewrite-caching header.
   - AASA `/e/*` and `/v/*`.
   - Dark F1 and A1 cards.
4. **Client, native release.**
   - Android intent filters `/e/` and `/v/`; `+native-intent`.
   - Install-referrer routing.
   - The new status-bar glyph and brand accent.
5. **Push.**
   - Server: `richContent.image` on starts_soon and waitlist_promoted (Android immediately).
   - Time Sensitive entitlement.
   - iOS NSE (images first, then communication notifications with the creature avatar).
6. **Later:**
   - IG Stories via `react-native-share` with a Meta App ID.
   - Android MessagingStyle module.
   - The recap.

**Open questions for the owner:**

| Question | Why it matters |
|---|---|
| Are the iOS App Store and Play listings public? | Smart Banner and store badges. The memory notes TestFlight and Play internal |
| Is the organiser name shown on public pages? | The "labels-only hosts" ruling, 2026-10-01 |
| Does a Meta developer app exist? | It is needed for IG Stories |
| What to do about the Satoshi files in the public admin repo | Licence |

---

## 4. Sources

**Platforms:**
- [WhatsApp link previews (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/)
- [Apple TN3156](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages)
- [Meta image specs](https://developers.facebook.com/docs/sharing/webmasters/images)
- [LinkedIn help](https://www.linkedin.com/help/linkedin/answer/a521928)
- [X dev forum: summary_large_image](https://devcommunity.x.com/t/twitter-card-summary-large-image/144086/2)
- [Google Messages previews](https://support.google.com/messages/answer/9327749?hl=en)
- [9to5Google, Messages redesign](https://9to5google.com/2025/11/28/google-messages-link-previews/)
- [Mysk, link previews](https://mysk.blog/2020/10/25/link-previews/)
- [opengraphplus: WhatsApp](https://opengraphplus.com/consumers/whatsapp/images)
- [opengraphplus: Telegram](https://opengraphplus.com/consumers/telegram/images)
- [opengraphplus: Discord](https://opengraphplus.com/consumers/discord/tags)
- [andrewbaker.ninja](https://andrewbaker.ninja/2026/03/05/fix-thumbnail-previews-on-whatsapp-linkedin-x-guide/)
- [opengraph.to](https://www.opengraph.to/articles/og-image-too-large)
- [whitep4nth3r: Slack](https://whitep4nth3r.com/blog/level-up-your-link-previews-in-slack/)
- [Beebom: WhatsApp disable previews](https://beebom.com/whatsapp-disable-link-previews/)
- [printlab PR: square crop](https://github.com/AyoubMoussaoui/printlab-website2/pull/16)

**Competitors:**
- Live pages fetched 2026-10-03:
  - [luma.com/ok1raqck](https://luma.com/ok1raqck)
  - [partiful.com/e/Iftnf5qvPRqBCCSBOC81](https://partiful.com/e/Iftnf5qvPRqBCCSBOC81)
  - [eventbrite](https://www.eventbrite.com/e/ai-search-lab-tickets-2000379613272)
  - [DICE](https://dice.fm/event/nvkp78-anjunadeep-open-air-bengaluru-india-tour-2026-15th-mar-jw-marriott-bengaluru-prestige-golfshire-resort-and-spa-bangalore-tickets)
  - [District](https://www.district.in/events/aashadh-ka-ek-din-sep4-2026-buy-tickets)
  - [Airbnb](https://www.airbnb.co.in/rooms/53116610)
  - [Spotify](https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT)
- [Luma social images](https://help.luma.com/p/updating-social-images)
- [Partiful privacy](https://help.partiful.com/en-us/articles/15525441-can-i-hide-the-guest-list-or-guest-count-on-the-party-page)
- [Apple Invites newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)
- [Apple Invites support](https://support.apple.com/guide/apple-invites/invite-guests-dev851dd16db/ios)
- [Spotify Wrapped 2025](https://newsroom.spotify.com/2025-12-03/2025-wrapped-user-experience/)
- [Spotify IG Stories](https://artists.spotify.com/blog/we've-made-it-easier-to-share-spotify-to-instagram-stories)

**OG generation:**
- [Next opengraph-image](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
- [Next htmlLimitedBots](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots)
- [Vercel OG](https://vercel.com/docs/og-image-generation)
- [Satori](https://github.com/vercel/satori)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- [Google Event structured data](https://developers.google.com/search/docs/appearance/structured-data/event)
- [Geist font](https://github.com/vercel/geist-font)
- Fontshare ITF FFL v2.0: `FFL.txt` in `https://api.fontshare.com/v2/fonts/download/satoshi`

**Share UX:**
- [RN Share docs source](https://raw.githubusercontent.com/facebook/react-native-website/main/docs/share.md)
- [Android sharing](https://developer.android.com/training/sharing/send)
- [Apple LinkPresentation](https://developer.apple.com/documentation/linkpresentation)
- [HIG activity views](https://developer.apple.com/design/human-interface-guidelines/activity-views)
- [Meta Sharing to Stories](https://developers.facebook.com/docs/instagram-platform/sharing-to-stories)
- [Instagram link sticker](https://about.instagram.com/blog/announcements/expanding-sharing-links-in-stories-to-everyone)
- [react-native-share](https://github.com/react-native-share/react-native-share)
- [expo-sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)
- [wa.me text (secondary)](https://forum.freecodecamp.org/t/whatsapp-click-to-chat-link-to-include-page-title-and-url-in-pre-filled-message/339727)
- [Story safe zones (secondary)](https://www.breakreach.com/guides/instagram-story-size)

**Deep links:**
- [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Expo iOS universal links](https://docs.expo.dev/linking/ios-universal-links/)
- [Expo Android App Links](https://docs.expo.dev/linking/android-app-links/)
- [Expo +native-intent](https://docs.expo.dev/router/advanced/native-intent/)
- [Smart App Banners](https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners)
- [Chrome intents](https://developer.chrome.com/docs/android/intents)
- [Chrome native app install](https://developer.chrome.com/blog/app-install-banners-native)
- [FDL FAQ](https://firebase.google.com/support/dynamic-links-faq)
- [Play Install Referrer](https://developer.android.com/google/play/installreferrer/library)
- [expo-application](https://docs.expo.dev/versions/latest/sdk/application/)
- [MacRumors: iOS paste](https://www.macrumors.com/2022/10/17/ios-16-1-paste-from-other-apps-settings/)
- [tolinku: iOS paste](https://tolinku.com/blog/ios-paste-permission-deferred-links/)

**Privacy:**
- DPDP Act [s.6](https://www.dpdpa.com/dpdpa2023/chapter-2/section6.html), [s.8](https://www.dpdpa.com/dpdpa2023/chapter-2/section8.html), [s.9](https://www.dpdpa.com/dpdpa2023/chapter-2/section9.html)
- [PIB DPDP Rules 2025](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
- [dcomply rule dates](https://dpdpa.dcomply.in/rules/)

**Push:**
- [Interruption levels](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel)
- [Communication notifications](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications)
- [UNNotificationAttachment](https://developer.apple.com/documentation/usernotifications/unnotificationattachment)
- [Modifying content (NSE)](https://developer.apple.com/documentation/usernotifications/modifying-content-in-newly-delivered-notifications)
- [HIG notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)
- [HIG managing notifications (mirror)](https://github.com/incrediblecrab/apple-os-documentation/blob/main/human-interface-guidelines/patterns/managing-notifications.md)
- [Time-sensitive entitlement (b4x)](https://www.b4x.com/android/forum/threads/usernotificationcenter-class-time-sensitive-notifications.161573/)
- [Expo iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/)
- Android: [notification anatomy](https://developer.android.com/develop/ui/compose/notifications), [notification design](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications), [build](https://developer.android.com/develop/ui/views/notifications/build-notification), [expanded](https://developer.android.com/develop/ui/views/notifications/expanded), [conversations](https://developer.android.com/develop/ui/views/notifications/conversations), [2016 design archive](https://webarchive.library.unt.edu/web/20160706094346mp_/https://developer.android.com/design/patterns/notifications.html)
- Expo: [push fields](https://docs.expo.dev/push-notifications/sending-notifications/), [notifications SDK](https://docs.expo.dev/versions/latest/sdk/notifications/), [PR 36202](https://github.com/expo/expo/pull/36202), [expo-notifications CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-notifications/CHANGELOG.md)
- [Notifee (archived)](https://github.com/invertase/notifee)
