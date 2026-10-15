# Blend'n redesign: reference apps, active/dormant states, and "alive" UI

> **Superseded in part (2026-10-02).** After this research was written, the vector monogram was extracted from the brand manual (`docs/redesign/assets/blendn-monogram.svg`), so "the mark exists only as PNG" no longer holds. The accent question is settled in `DESIGN-BRIEF.md` §4 (brand orange `#F05423`, violet corrected to `#925DA9`). Where this file and the brief disagree, the brief wins.


Research input for the Claude Design brief. Compiled 2026-10-02.

**Method.** Web search and fetch only, no answers from memory. Apple HIG pages were read from Apple's JSON documentation endpoints (`developer.apple.com/tutorials/data/design/human-interface-guidelines/*.json`), because the HTML pages render client-side. Material 3 token values come from Google's Android source on GitHub. Mobbin and Refero sit behind logins and were not usable, and 60fps.design is partly paywalled (free shot descriptions only). Contrast ratios were computed with the WCAG 2.x relative-luminance formula.

**How claims are marked.** Every claim links its source.
- **(summary)**: the claim comes from a search-engine summary of the page, because the page itself refused the fetch (403/paywall). It is probably right but was not read first-hand.
- **UNVERIFIED**: no primary source was found.
- **Reasoning**: my own inference, not a sourced fact.

---

## 0. Where the product is today

The client repo (`the local client checkout`, `origin/dev` at `54481d2`, 2026-10-01) was checked so the recommendations start from what exists.

- **The centre button already has the four states, as a pure function.** They live in `lib/roomButton.ts`: `live | checkin | today | idle`. Precedence is live > checkin > today > idle. The "inside the fence" input comes from presence hysteresis, so the button does not flicker on GPS noise. The labels exist in code ("Room", "Check in", "Tonight", "What's on") but are **not rendered**. The VoiceOver labels state the consequences.
- **Current rendering** (`app/(tabs)/_layout.tsx`):
  - A **flat accent disc in every state** (`EMBER.accent #FF906D`). The mark is `monogram-white-bold.png`, tinted ink `#1B1931`.
  - Status is carried by a **still dot**: white for `checkin` ("there is a room here"), green for `live` ("you are in it"), nothing otherwise.
  - The unread badge, shown only in `live`, replaces the dot.
  - A breathing halo (out to 1.42×) was **removed**. Comment: "motion cannot carry a state… invisible in a screenshot, to anybody who has turned motion off". Also "effects on effects, a warm glow that read as generated".
  - The code also argues that "a logo that changes colour depending on whether you are near an event is not a logo".
- **The mark exists only as PNG.** The files are `monogram-white.png`, `monogram-white-bold.png` and `monogram-gradient.png`. A code comment records that a *filled* variant made by flood-filling the enclosed regions "destroys the mark — the B becomes a blob". **So "fill the outlined logo" cannot mean filling the glyph. It has to mean filling the disc behind it.** Animating the stroke itself (gradient stroke, draw-on) would need the designer's vector.
- **Stack:**
  - Expo SDK 57, RN 0.86 (New Architecture), Reanimated 4.5.1, react-native-worklets 0.10.1, react-native-svg 15.15.4.
  - expo-linear-gradient, expo-blur, expo-haptics, expo-image.
  - **No** Skia, **no** expo-glass-effect, **no** masked-view.
  - Custom JS tab bar (`expo-router/js-tabs`).
- **The brand and app tokens disagree.** The brief says orange `#F05423` to violet `#8E4BAA` on `#0D0C0C`. The app ships page `#0F0E0E` and accent `#FF906D` (Figma drew `#FF906D → #FF6D8D`), with a code rule of "no gradient, no glow" on the primary action. The redesign brief needs to state which set wins.

### Computed contrast (WCAG 2.x) on the brand near-black `#0D0C0C`

| Colour | vs `#0D0C0C` | Notes |
|---|---|---|
| Orange `#F05423` | **5.58:1** | Passes text AA and the 3:1 non-text minimum |
| Rose `#BE5C71` | 4.61:1 | |
| Violet `#8E4BAA` | **3.48:1** | Only just clears 3:1 for graphics; too low for small text |
| Green `#30D158` (live dot) | 9.66:1 | |
| White | 19.53:1 | |
| Orange vs violet (the two gradient ends) | **1.60:1** | A palette shift between them is a **hue** change with almost no lightness change |
| Ink `#1B1931` on orange | 4.88:1 | Ink mark on a gradient disc works |
| Ink `#0D0C0C` on violet | 3.48:1 | |
| Green dot vs orange disc | **1.73:1** | The dot must sit on page colour, not on the fill |
| White on `#FF453A` (iOS red badge) | **3.41:1** | Fails 4.5:1 for small badge digits |
| A typical glass disc `#1F1D1D` vs page | 1.16:1 | A glass disc's edge is invisible on its own |

**Implication for Blend'n.**
- The state logic is done and well reasoned. The redesign is a **rendering** problem, so the brief should not re-derive the states.
- Two facts constrain every centre-button idea below:
  1. The mark cannot be "filled". Only the disc can.
  2. Orange↔violet differ by 1.6:1, so a palette transition **cannot be a still-frame signal**. It can only decorate a state that something else already signals.

---

## 1. Reference apps (2025–2026)

Each entry covers: what makes it feel alive, its signature interaction, how it shows live/now, how it treats event and people cards, and what transfers or should be avoided.

### 1.1 Apple Invites (launched Feb 2025)
- **Alive / signature.**
  - The invite *is* a full-bleed image. Hosts pick from "a curated collection of images representing different occasions and event themes", a photo, or an Image Playground generation ([Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)).
  - Onboarding is "a color-shifting card carousel" ([60fps.design](https://60fps.design/apps/apple-invites)).
  - Events are cards you swipe between, covering both your own and those you're attending ([MacRumors hands-on](https://www.macrumors.com/2025/02/04/apple-invites-app-hands-on/)).
- **Live/now.** No live state as such. Instead the card gets *more specific as the date nears*: "weather becoming more specific as the event date approaches", plus Maps directions ([MacRumors](https://www.macrumors.com/2025/02/04/apple-invites-app-hands-on/)). After the event, a Shared Album and a collaborative Apple Music playlist keep it alive ([Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)).
- **People.** "All invitees and the event creator can see who is going" ([MacRumors](https://www.macrumors.com/2025/02/04/apple-invites-app-hands-on/)).
- **Transfer:**
  - An event card that **sharpens as time approaches**. Days-away cards show date and venue; same-day cards gain doors time, weather and a "you're 1.2 km away" line.
  - The post-event shared album idea, matching Blend'n's "Board" timeline.
- **Avoid:** emoji/balloon stock backgrounds. They suit a birthday app, not nightlife.

### 1.2 Partiful
- **Alive / signature.**
  - Invites are a creative object: "humorous, casual designs, some of which are created by Partiful's in-house designers", e.g. "lime-green parodies of Charli XCX's 'brat'" ([CNBC](https://www.cnbc.com/2025/04/19/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple.html), summary).
  - "Animated backgrounds", "bouncing bubbles across the page", and **"Boops"**, playful reactions when someone joins the guest list ([party.pro review](https://party.pro/partiful/)).
  - A Pratt critique found creating an invite "so joyful" that it "almost becomes an event itself". The same critique faulted blank space and a non-customisable "Auto Reminders" block that looks tappable but isn't ([Pratt IxD](https://ixd.prattsi.org/2025/02/design-critique-partiful/)).
- **Live/now.** The activity feed and comment wall. "When you RSVP… you can immediately see who else is attending" ([party.pro](https://party.pro/partiful/)). **Mutuals** ("everyone you've ever partied with") form a social graph built from attendance (summary via [App Store / Wikipedia results](https://en.wikipedia.org/wiki/Partiful)).
- **Cards.** The RSVP row is ordered going / maybe / can't go, a natural mapping ([Pratt IxD](https://ixd.prattsi.org/2025/02/design-critique-partiful/)).
- **Transfer:**
  - Small social reactions to *joining* (a "boop" when someone RSVPs). Blend'n's equivalent is a tiny reaction when someone checks into a room you're in.
  - A social graph built from co-attendance (Mutuals = Blend'n's "came back" / crew logic).
- **Avoid:** animated *backgrounds on content* (bubbles, emoji rain). They are fun for one invite and noise in a feed of 30.

### 1.3 Luma
- **Alive / signature.**
  - 40+ themes (Minimal, Quantum, Confetti, Emoji, Pattern, seasonal), with "animations, particles, or video backgrounds" and light/dark variants ([Luma Help](https://help.luma.com/p/event-themes-and-customization)).
  - The signature motion: tapping shuffle on the invite card crossfades the artwork, and "the entire screen's background color smoothly shifts to match the dominant hue of the new theme" ([60fps.design](https://60fps.design/shots/luma-create-event-random-theme)). **This is photo- or theme-derived page tint, done well.**
- **Live/now.** Check-in by QR, with an "Express Mode" giving "color-coded feedback for each scan and a list of recently scanned guests" ([Luma Help: check-in](https://help.luma.com/p/check-in)). Hosts can toggle "Show Who's Coming" ([Luma Help: guest list](https://help.luma.com/p/managing-your-guest-list)). Recent updates add map browsing ([App Store](https://apps.apple.com/us/app/luma-delightful-events/id1546150895)).
- **Transfer:** the event page's background tints to the cover's dominant hue, over a near-black base (see §3.5).
- **Avoid:** Luma's look is now the default "tech meetup" aesthetic. Copying its card proportions will make Blend'n read as a meetup app, not nightlife (reasoning).

### 1.4 Timeleft
- **Alive / signature.** The **staged reveal**.
  - The night before, you learn your table-mates' industries (and zodiac signs). On the day, the venue and first names ([Axios San Antonio](https://www.axios.com/local/san-antonio/2024/07/18/timeleft-app-lonely-meet-san-antonio), summary).
  - In the App Store's words: "The day of, we reveal your venue and a preview of who you'll meet", with "in-app icebreakers" ([App Store](https://apps.apple.com/us/app/-/id6466442949)).
  - An after-dinner bar is revealed for everyone who dined that night ([Axios](https://www.axios.com/local/san-antonio/2024/07/18/timeleft-app-lonely-meet-san-antonio), summary).
- **Live/now.** The "game" unlocks when the dinner begins (summary, [Axios](https://www.axios.com/local/san-antonio/2024/07/18/timeleft-app-lonely-meet-san-antonio)). Post-event ratings and "Repeat" invite a connection back ([App Store](https://apps.apple.com/us/app/-/id6466442949)).
- **Critique.** Before booking there is no social proof, so users "rely on assumptions and guesswork" ([Pratt IxD](https://ixd.prattsi.org/2025/02/design-critique-timeleft-app/)).
- **Transfer:** **time-gated unlocks are the most direct analogue to Blend'n's mode switch.** Something is closed until a time or place condition is met, then visibly opens.
- **Avoid:** suspense with no social proof. Blend'n should show *how many* are going (without who) before check-in. That matches the "blind regulars" product ruling in memory.

### 1.5 Hinge
- **Signature.** Likes attach to a specific photo or prompt: "tap the Heart icon on any of their photos or prompts… attach a comment" ([Hinge Help](https://help.hinge.co/hc/en-us/articles/36311632894995-Likes)).
- **2025 changes:**
  - Prompt Feedback (Jan).
  - Match Note, a private note shown before chatting (Feb).
  - Convo Starters, shown "beneath prompts and photos".
  - "Are You Sure?", a modal before offensive messages.
  - Chat-specific notifications.
  ([Hinge newsroom](https://hinge.co/newsroom/hinge-2025-product-evolution)).
- **People cards.** A vertical profile of large photos interleaved with prompt cards, each with its own like control ([Hinge Help](https://help.hinge.co/hc/en-us/articles/36311632894995-Likes)).
- **Transfer:**
  - In the Room, a like on a *specific* thing (a photo, or "the drink you're having") gives the match moment a first line of conversation.
  - "Are You Sure?" maps onto Blend'n's moderation pipeline as a pre-send nudge.
- **Avoid:** full Hinge-style long profiles inside a live room. In a bar you need a glanceable card, not a scroll.

### 1.6 Bumble (2024 rebrand, 2025 BFF relaunch, 2026 reset)
- **2024 rebrand.** "A refreshed logo, colour palette, typography, and custom illustrations… more modern, playful, intuitive", keeping black-and-yellow, done in-house ([Creative Boom, 30 Apr 2024](https://www.creativeboom.com/news/female-first-dating-app-bumble-unveils-bold-new-look-and-useful-new-feature/)).
- **2025 BFF.** BFF was rebuilt on Geneva (acquired 2024, ~$17M). It merges "one-on-one friend matching, physical meet-up events, and community spaces" ([Global Dating Insights, 8 Aug 2025](https://www.globaldatinginsights.com/featured/bumble-bets-big-on-friendships-with-revamped-bff-app/)). In the US, BFF Mode and Bumble For Friends were replaced by a single "BFF" app in late Oct 2025 ([BFF support](https://support.bumblebff.com/hc/en-us/articles/29674210518301-Moving-from-Geneva-to-BFF), summary). The headline addition is a Groups tab with chats, meet-ups and an in-app calendar (summary, same source set).
- **2026 reset.** Wolfe Herd: "We are going to be saying goodbye to the swipe". The rollout is Q4 2026 in select markets, and the women-message-first rule is being dropped ([Engadget](https://www.engadget.com/2167487/bumble-will-replace-swiping-right-with-something/)). Reported: profiles become "vertical storytelling… chapters", and an AI assistant "Bee" suggests matches ([Axios, 11 May 2026](https://www.axios.com/2026/05/11/bumble-reset-gen-z-dating-apps), summary; 403 on fetch).
- **Transfer:** the category is **moving away from swipe toward context-first connection**. Blend'n's "like someone in the same room" already sits where Bumble is heading.
- **Avoid:**
  - Any swipe-deck UI in the Room.
  - Bumble's 2024 identity: yellow, illustrated, playful. That is daytime dating, not nightlife.

### 1.7 DICE
- **Signature live state.** "The ticket lives within the DICE app, which turns into an animated QR code an hour before doors open". It is animated "so you can't screengrab it" ([TicketNews](https://www.ticketnews.com/2019/09/mobile-ticketing-app-dice-puts-fans-first-with-transparency-waiting-lists/), summary). DICE support has a page titled "How to activate your tickets on the day of the event" ([DICE help](https://dicefm.zendesk.com/hc/en-gb/articles/19413725197713-How-to-activate-your-tickets-on-the-day-of-the-event), 403 on fetch).
- **Waiting list.** One tap to join a sold-out show, with a confirmation and a notification preference ([case study](https://medium.com/@jasmine.oulmi/from-disappointment-to-hope-a-ux-deep-dive-into-dices-waitlist-feature-ef1491fdfef6)).
- **Transfer: this is the closest precedent for state (c).** An object that is inert all week **transforms on the day, near the time** into the thing you show at the door. The animation is functional there (anti-screenshot), not decorative.
- **Avoid:** DICE's austere black-and-white list UI on its own. It is credible for music but has no social layer (reasoning).

### 1.8 Posh
- **Signature.** A "one-by-one feed similar to TikTok of personally curated recommendations", ranked partly on "where people in your contacts are going" ([Black Enterprise](https://www.blackenterprise.com/black-gen-z-founders-40m-events-platform-posh/), summary). The App Store copy: "see what the vibe is and who's going", "See which events your friends are going to", and "Kickbacks" that turn guests into promoters ([App Store](https://apps.apple.com/us/app/posh-create-find-events/id1556928106)).
- **Transfer:** friend presence on an event card ("3 people you've met are going") is the strongest discovery signal for nightlife.
- **Avoid:** a full-screen vertical event feed. It optimises time-in-app, while Blend'n's job is to get you out the door (reasoning).

### 1.9 District by Zomato (India)
- District "opts for a purple theme and a zany font as opposed to Zomato's red". "The dark theme is easy on the eyes". "The tabs are neatly laid out on the top" ([OfficeChai](https://officechai.com/startups/zomato-launches-its-going-out-app-district/)).
- It won Google Play's **Best App 2025 in India** ([Analytics Insight](https://www.analyticsinsight.net/news/google-play-releases-its-best-apps-of-2025-lineup-featuring-zomato-district-and-focus-friend)).
- **Transfer:** proof that a dark, purple-leaning "going out" app is the *current Indian default* for this category.
- **Avoid:** **this is a differentiation risk.** A Blend'n with violet dominant would sit visually next to District. Lead with the **orange** end and the orb art, and keep violet as the far end of the gradient (reasoning, from the contrast numbers above).

### 1.10 Fever
- Fever is a discovery and booking platform in 500+ cities, with categories including Candlelight concerts ([Wikipedia](https://en.wikipedia.org/wiki/Fever_(app)), summary).
- One A/B test showed six events per screen in a grid instead of one at a time ([Itamar Gilad case study](https://itamargilad.com/case-study-how-fever-uses-a-b-experiments-and-data-analysis-to-double-customer-lifetime-value/), summary).
- A "happening now" filter for spontaneous users: **UNVERIFIED** (seen only in a search summary with no traceable page).
- **Transfer:** density matters for "tonight" browsing. The Pulse's day-grouped list should show more than one card per screen height.
- **Avoid:** Fever's ticket-commerce visual language (price-first cards). Blend'n's money rulings keep in-app purchase separate.

### 1.11 Airbnb 2025 redesign (May 2025)
- **Alive / signature.**
  - New 3D icons, described by VP of Design Teo Connor as a "universal language" with "loads of fun details".
  - "A softer feel across the board", "more curved edges", animation with "subtle intensities".
  - The Trips tab became a "living itinerary" across stays, services and experiences.
  - All made in-house ([It's Nice That](https://www.itsnicethat.com/articles/airbnb-app-redesign-140525)).
- **Icon behaviour.**
  - The house icon "pops open and illuminates its porch light when tapped", the bell "rattles", the balloon "bounces as a burner fires" ([Bloomberg](https://www.bloomberg.com/news/articles/2025-06-13/apple-airbnb-ditch-flat-app-icons-for-new-3d-ui-design), summary).
  - The icons are a custom micro-video format, "Lava", with alpha ([Medium deep-dive](https://medium.com/@waldobear002/airbnbs-new-lava-icon-format-a-technical-deep-dive-b2604626c7e0), summary). An independent MIT re-implementation, OpenLava, ships for iOS, Flutter and Web, **not React Native** ([GitHub](https://github.com/OpenLavaFormat/OpenLava)).
- **Critique.** Skeuomorphism is "maximalist, opinionated, and expensive", and AI can now replicate the look overnight ([One Thing newsletter](https://onethingnewsletter.substack.com/p/airbnbs-relaunch-and-the-texture)).
- **Transfer:**
  - The **tactile press** (the Blend'n button already squashes to 0.9 "Airbnb's tactile tab button", per `_layout.tsx`).
  - The "living itinerary" idea for the Going tab.
- **Avoid:** 3D or skeuomorphic icons. They break Blend'n's "outlined icons only" brand rule and have no RN player.

### 1.12 Instagram / Threads
- **Story ring, the canonical still-frame state.**
  - A pink-orange **gradient ring = unseen**; a **grey ring = seen**; a **green ring = Close Friends** ([Lilach Bullock](https://www.lilachbullock.com/instagram-green-icon-on-stories/)).
  - When live, the avatar ring carries the word **"Live"** ([Techlicious](https://www.techlicious.com/tip/instagram-icon-meanings-explained/), summary).
  - **This is the same gradient family as Blend'n and the same job: ring present and coloured = something to open now.** It stays legible because it pairs colour with *presence/absence* and a *text label*.
- **Instagram Map (Aug 2025).** Opt-in "last active location" sharing with friends you choose. It lives at the top of DMs and updates only when the app is opened ([Meta](https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/)).
- **India nav test (Sep 2025).** A Reels-first build in India where "DMs will move to the center of the navigation bar" and Create moves to the top-left ([Meta](https://about.fb.com/news/2025/09/in-india-instagram-debuts-a-reels-first-experience-for-its-mobile-app/); [TechCrunch](https://techcrunch.com/2025/09/29/instagram-is-testing-a-reels-first-ui-in-india-and-south-korea)). Indian users are being taught that **the centre slot is "people", not "create"**, which fits Blend'n's centre = the room.
- **Threads.** Communities added an "Online" status dot, member counts and an online-member count (summary, [SocialBee](https://socialbee.com/blog/threads-news/)).
- **Transfer:** the gradient ring as an "openable now" marker, plus a literal word ("Live", "Here") when it matters.
- **Avoid:** copying the Instagram ring 1:1 on avatars. Blend'n's orange-to-violet will read *as Instagram* (reasoning).

### 1.13 BeReal
- **Signature.**
  - One daily, unpredictable prompt, "⚠️ Time to BeReal ⚠️", with two minutes to post ([BeReal help](https://help.bereal.com/hc/en-us/articles/7350386715165--Time-to-BeReal)).
  - After the window, posts carry a "late" marker showing how late they were ([How-To Geek](https://www.howtogeek.com/878763/when-does-bereal-go-off/), summary).
  - Voodoo bought it in 2024 and added ads in 2025 ([Wikipedia](https://en.wikipedia.org/wiki/BeReal), summary).
- **Transfer:** a *window* is a strong "now" signal. Blend'n's check-in exists only while the event runs and you are inside the fence, and the UI can say so ("Check-in open · till 1am").
- **Avoid:** fake urgency (countdowns that are not real) and the warning emoji.

### 1.14 Apple Sports / Live Activities / Find My / system indicators
- **Apple Sports.** It adopted Live Activities for scores on the Lock Screen and in the Dynamic Island (iOS 18), plus the watchOS Smart Stack ([9to5Mac](https://9to5mac.com/2024/09/16/apple-sports-adds-live-activities-in-ios-18-for-easy-score-tracking/); [MacRumors](https://www.macrumors.com/2024/09/16/apple-sports-app-live-activities/)).
- **Live Activities HIG** ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities)):
  - For events "that have a defined beginning and end… don't exceed eight hours".
  - "Avoid displaying sensitive information" (Lock Screen and Always-On are visible to bystanders).
  - "Update a Live Activity only when new content is available".
  - Animations max "two seconds", and "the system doesn't perform animations on Always-On displays".
  - "Use animations to reinforce the information… numeric content transitions for score changes".
  - In the Dynamic Island, "consider using bold colors… to convey the personality and brand".
  - "If you include a logo mark, display it without a container".
  - "Don't add elements to your app that draw attention to the Dynamic Island".
  - End it promptly; a 15–30 min dismissal is "adequate" in most cases.
- **Find My.** A "Live" label under a friend's name means real-time sharing ([SlashGear](https://www.slashgear.com/1243248/what-you-need-to-know-about-the-live-feature-on-find-my-friends/), summary). The pulsing green circle around the avatar while locating is summary-only, **UNVERIFIED** in detail.
- **System privacy dots.** A green dot means the camera is in use and an orange dot means the microphone is in use. They are static dots in the status bar ([How-To Geek](https://www.howtogeek.com/691434/what-are-the-orange-and-green-dots-on-an-iphone-or-ipad/)). Apple uses **a tiny still dot, not motion,** for the most important always-on status on the phone. That supports Blend'n's existing still-dot decision.
- **Transfer:** a **Lock Screen / Dynamic Island Live Activity for state (d)** ("In the room · Toit, Indiranagar · 3 unread"), with counts and never names. Android 16's "Live Updates" are the equivalent: promoted ongoing notifications with a status-bar chip of max 96dp ([Android Authority](https://www.androidauthority.com/android-16-live-notifications-3518375/), summary; [OneSignal docs](https://documentation.onesignal.com/docs/en/android-live-notifications), summary).

### 1.15 Spotify
- **Colour from artwork.** Spotify's own developer guideline: "Extract artwork color for background (Android Palette). If not possible, use Spotify color #191414". It also forbids altering artwork: "Don't animate or distort it… This includes applying overlays and blurring" ([Spotify Design guidelines](https://developer.spotify.com/documentation/design)).
- **Jam / listening activity (Jan 2026).** Friends' listening activity sits at the top of Messages and in the chat side drawer, with six emoji reactions and a "Request to Jam" that times out "within a few minutes" ([Spotify Newsroom](https://newsroom.spotify.com/2026-01-07/listening-activity-request-to-jam-messages-updates/)).
- **Transfer:**
  - Artwork-tinted pages over a fixed dark base.
  - Presence shown *inside the inbox* (Banter could show "live now" rooms at the top, the way Spotify puts live listening at the top of Messages).
- **Avoid:** blurring event covers into the background *and* showing them sharp at the same time, which doubles the image (reasoning). Spotify's own rule bans that for artwork.

### 1.16 Apple Music (artwork-driven ambient background)
- The Now Playing background is built from four rotating, orbiting copies of the artwork at 25/50/80/125% scale. A "twist" distortion and a Kawase blur follow. The web re-implementation caps at **15 fps** with a low-power GPU preference ([Aadish V reverse-engineering](https://www.aadishv.dev/music)).
- **Transfer:** this is exactly how to make Blend'n's "orbs" feel alive cheaply. Blur large shapes, move them slowly, and render the backdrop at a low frame rate.

### Pattern catalogue: how these apps say "live / now"

| Signal | Who | Still-frame legible? |
|---|---|---|
| Object transforms on the day (inert → active) | DICE QR, Timeleft reveal, Apple Invites weather | Yes: the content itself changes |
| Ring present + gradient colour | Instagram story ring | Yes: presence/absence + colour |
| Literal word | Instagram "Live", Find My "Live", BeReal "late" | Yes: text |
| Small still dot | iOS privacy dots, Threads "Online" | Yes, if dot contrast ≥3:1 |
| Live Activity / status chip outside the app | Apple Sports, Android 16 Live Updates | Yes |
| Facepile / who's going | Partiful, Posh, Apple Invites | Yes |
| Ambient colour from content | Luma, Spotify, Apple Music | Decorative, not a state |

**Implication for Blend'n.**
- No reference app uses **motion alone** to say "live". The ones that hold up pair **a shape change, a word, or content transformation** with colour.
- Blend'n's centre button should borrow three things:
  1. **DICE's "transforms on the day"**: the disc goes from empty to filled.
  2. **Instagram's ring**: a gradient rim for "something tonight".
  3. **iOS's still dot**: green for "you're in".
- Ship a **Live Activity for (d)** on iOS (and an Android Live Update later). Being in a room lasts a few hours and has a defined start and end, which is the HIG's own definition of a Live Activity.
- Differentiate from District by leading with orange. Do not use avatar gradient rings, which read as Instagram.

---

## 2. Active vs dormant: the techniques, the rules, the recommendation

### 2.1 Vocabulary: the states a control can be in, and how dark glass changes them

| State | Definition and source | Dark-glass treatment |
|---|---|---|
| **Enabled** | "can be pressed or otherwise interacted with" ([NN/g](https://www.nngroup.com/articles/button-states-communicate-interaction/)) | Full-contrast content; on glass use the vibrant/monochrome label colours ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)) |
| **Pressed** | Must appear in 100–150 ms ([NN/g](https://www.nngroup.com/articles/button-states-communicate-interaction/)); HIG: "Always include a press state for a custom button" ([HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)) | M3 pressed state layer = **10%** overlay ([M3 tokens](https://github.com/material-components/material-components-android/blob/master/lib/java/com/google/android/material/resources/res/values/tokens.xml)); hover 8%, focus 10%, dragged 16%. On glass, a scale-down (0.9) plus a 10% white overlay reads better than darkening, which disappears on near-black (reasoning) |
| **Selected** | A persistent choice, distinct from pressed ([NN/g](https://www.nngroup.com/articles/button-states-communicate-interaction/); [Material states](https://m2.material.io/design/interaction/states.html)) | Two channels: filled vs outline glyph **and** colour (already done in Blend'n's tab bar: `flame` vs `flame-outline` plus accent) |
| **Activated** | Material separates "activated" from "selected" ([Material states](https://m2.material.io/design/interaction/states.html)) | A Blend'n centre button in state (d) is "activated": a mode is on |
| **Disabled** | "action is unavailable" ([NN/g](https://www.nngroup.com/articles/button-states-communicate-interaction/)); M3 disabled content = **38%** opacity ([M3 tokens](https://github.com/material-components/material-components-android/blob/master/lib/java/com/google/android/material/resources/res/values/tokens.xml)); container 12% (summary of [M3 states](https://m3.material.io/foundations/interaction/states/applying-states)); "disabled states have no state overlays" ([Material](https://m2.material.io/design/interaction/states.html)) | Disabled controls are **exempt** from WCAG non-text contrast ([W3C 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). On translucent glass, 38% white over a moving backdrop can vanish, so put disabled controls on a solid surface (reasoning, consistent with [NN/g glassmorphism](https://www.nngroup.com/articles/glassmorphism/)) |
| **Inactive / dormant** (available, nothing happening) | Not a WCAG category; it is a **normal enabled control** with less to say | Must stay fully operable and ≥3:1. **Never style "idle" like "disabled"** |
| **Loading** | Spinner in the button; HIG: label can change to "Checking out…" ([HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)) | Use for the check-in call itself |

**Disable vs hide vs explain.**
- NN/g: disabled buttons "often confuse users"; use sparingly and explain why. 60% of respondents preferred an always-clickable action with immediate feedback ([NN/g video](https://www.nngroup.com/videos/why-disabled-buttons-hurt-ux-and-how-to-fix-them/), summary).
- Smashing: "Explain why a feature is disabled and also how to re-enable it", and "Keep buttons and features enabled by default" ([Smashing, 2024](https://www.smashingmagazine.com/2024/05/hidden-vs-disabled-ux/)).
- This supports the repo's rule that every centre-button state "goes somewhere real".

**Apple's prominence model.**
- HIG: "use a button that has a prominent visual style for the most likely action… Keep the number of prominent buttons to one or two per view" ([HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)).
- On Liquid Glass: "To emphasize primary actions, apply color to the background rather than to symbols or text… Refrain from adding color to the background of multiple controls" ([HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)).
- In SwiftUI, `.glassProminent` "applies a prominent Liquid Glass effect" and is "similar to the borderedProminent style" ([Apple docs](https://developer.apple.com/documentation/swiftui/primitivebuttonstyle/glassprominent)). `Glass.tint(_:)` is how you "suggest prominence", and `.interactive()` makes custom glass react to touch ([Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)).
- **Translation: `.glass` = neutral control; `.glassProminent` = the one coloured-background action.** That maps one-to-one onto "dormant disc" vs "filled disc".

**Glass placement.**
- "Don't use Liquid Glass in the content layer"; "Use Liquid Glass effects sparingly… Limit these effects to the most important functional elements" ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)).
- Clear glass is only for "components that appear over visually rich backgrounds", with a **35% dark dimming layer** if the content beneath is bright (same source).
- NN/g found iOS 26 glass controls "nearly invisible when placed over busy backgrounds" and the animated interface "shouting 'look at me'" ([NN/g, Oct 2025](https://www.nngroup.com/articles/liquid-glass/)).

### 2.2 Technique catalogue

"Still frame" means a screenshot with Reduce Motion on. Cost is relative and refers to the current stack (Reanimated 4.5 / react-native-svg 15 / RN 0.86 New Architecture / no Skia).

| Technique | How it reads as a still frame | Accessibility | RN implementation | Cost | Verdict for the centre button |
|---|---|---|---|---|---|
| **Filled vs outlined** (container) | Strongest. Area and polarity flip; survives grayscale and colour-blindness | Satisfies 1.4.1 via a lightness difference ≥3:1 ([W3C 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)) | `expo-linear-gradient` inside a clipped circle, swapped against a glass disc | Trivial | **Use**: the backbone |
| **Stroke → fill on the glyph** | Strong, but **not possible on this mark** (flood fill destroys it, per repo) | n/a | Needs the vector mark; react-native-svg `Path` | n/a | **Don't**: fill the disc instead |
| **Gradient stroke, drawn on** (strokeDashoffset) | As a still, only "ring present / absent" | Fine; animation is one-shot | react-native-svg `Circle` plus Reanimated `useAnimatedProps` on `strokeDashoffset`; Reanimated's `gradient` prop animates stop `{offset,color,opacity}` and even the stop count ([Reanimated SVG guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg/)); CSS animations on SVG on by default from 4.4 (same) | Low | **Use** for the (b) rim |
| **Colour vs value contrast** | Hue-only changes fail. Orange↔violet = 1.6:1 | 1.4.1: a lightness difference counts only if ≥3:1 ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)); HIG: "Convey information with more than color alone" ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)) | n/a | n/a | **Rule**: every state change must change *value or shape*, not only hue |
| **Neon glow** (layered shadows, bloom) | Visible as a still *if the glow is static at rest* | Glow is decoration; it must not be the only signal | RN New Architecture `boxShadow` takes **multiple shadows** (array or comma string), coloured, with spread, **no background needed**; outset on Android 9+ ([RN docs](https://reactnative.dev/docs/view-style-props); [RN 0.76](https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture)). The web technique is a tight bright core plus wider dimmer halos, 3–5 layers, zero offset ([csstools](https://csstools.io/blog/css-neon-text-effect), summary) | Low (static); medium if animated | **Use** in (c) only, static at rest |
| **Breathing halo** (looping scale/opacity) | Invisible as a still (the repo already removed one for this reason) | WCAG 2.2.2: moving content that starts automatically, lasts **>5 s** and sits beside other content needs pause/stop/hide; the W3C example is an arrow that "blinks to get attention but stops after 5 seconds" ([W3C 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). Reanimated: with `ReduceMotion.System` (the default), an infinite or even-count reversed `withRepeat` **does not start** ([Reanimated a11y](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/)). visionOS HIG warns against sustained oscillation near **0.2 Hz** (a 5 s period) ([HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)) | `withRepeat(withTiming(..), 6, true)` = 3 breaths | Low per frame, but battery over hours | **Only as a ≤5 s burst** on entering (c), then hold |
| **Pulsing ring / ripple** (one expanding ring) | Invisible as a still | Fine as one-shot feedback ("Aim for brevity and precision", [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)) | An Animated.View ring with scale 1→1.35 and opacity → 0 | Low | **Use once**, for the check-in success moment |
| **Conic / "aurora" rotating border** | Still frame shows a lopsided gradient ring, reading as a glitch | Continuous loop, so 2.2.2 applies | **react-native-svg has no conic gradient** (SVG has none). It needs Skia `SweepGradient` + `Blur` with a Reanimated rotation ([Skia discussion #2025](https://github.com/Shopify/react-native-skia/discussions/2025)). Skia: image filters "create offscreen buffers… blur being one of the most expensive" ([Skia docs](https://shopify.github.io/react-native-skia/docs/image-filters/shadows/), summary) | **New dependency + GPU** | **Skip.** It is also on the AI-slop list (§3.12) |
| **Sheen / specular sweep** | Invisible as a still | Fine if one-shot | Animate the `gradient` stop offsets (Reanimated) or a translucent LinearGradient translateX across the clipped disc | Low | **Optional**, one-shot, as the "palette transition" the owner asked for |
| **Status dot** | Strong if ≥3:1 against the *page* | Shape plus colour; HIG Live Activity: show updated info, not just a logo | Existing `Animated.View` ringed in page colour | Trivial | **Keep**, but make (c) and (d) different *shapes* |
| **Label / pill** | Strongest of all (text) | Ideal | Existing `roomButtonLabel()` | Trivial | **Use** for (c), the only state that takes an action with consequences |
| **Live Activity / Dynamic Island / Android Live Update** | Yes, outside the app | Follow the HIG list in §1.14 | `expo-live-activity` was **archived 1 Jun 2026** and recommends expo-widgets ([GitHub](https://github.com/software-mansion-labs/expo-live-activity)). Callstack's **Voltra** authors Live Activities in React/JSX via an Expo module and supports server push; public preview, iOS-only at its Jan 2026 launch ([Callstack](https://www.callstack.com/blog/live-activities-and-widgets-with-react-say-hello-to-voltra)). Android Live Updates work is visible in a Voltra PR ([PR #325](https://github.com/callstackincubator/voltra/pull/325)); release status **UNVERIFIED** | Native extension | **Use** for (d), as a separate ticket |
| **Liquid Glass (.glass vs .glassProminent)** | Clear: neutral vs tinted container | Responds to Reduce Transparency / Increase Contrast automatically ([HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)) | `expo-glass-effect` `GlassView` (`glassEffectStyle` regular/clear, `tintColor`, `isInteractive`) is **iOS 26+ only** and falls back to `View`. "Setting `opacity` to 0 on GlassView or any of its parent views causes the glass effect to not render at all" ([Expo docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/)). **Not installed.** `expo-blur` works on both platforms; Android needs `BlurTargetView` and `blurMethod: 'dimezisBlurViewSdk31Plus'`, because blur is efficient only with RenderNode (SDK 31+) ([Expo BlurView](https://docs.expo.dev/versions/latest/sdk/blur-view/)) | Medium | Glass for the bar and the dormant disc. Gradient fill (not tinted glass) for the active disc |
| **Native tabs** | n/a | n/a | expo-router `NativeTabs` gives real iOS 26 glass, badges, a bottom accessory (SDK 55+) and minimise-on-scroll, but has **no custom centre button**, a max of 5 Android tabs, and no runtime tab changes ([Expo docs](https://docs.expo.dev/router/advanced/native-tabs/)) | n/a | **Stay on the custom JS bar.** The centre disc rules out NativeTabs |

**Battery and frame cost.**
- Apple's energy guide tells apps in Low Power Mode to "reduce the use of animations, lower frame rates, stop location updates" ([Apple Energy Guide](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/EnergyGuide-iOS/LowPowerMode.html)). ProMotion caps at 60 Hz in Low Power Mode ([MacRumors forum](https://forums.macrumors.com/threads/promotion-is-off-when-you-choose-low-power-mode.2313697/), summary).
- **A nightlife app is used late, on low battery, at the venue. That is the exact moment state (c) occurs.** No perpetual animation belongs on the centre button.
- `boxShadow` is static and cheap. Skia blur is the expensive path.

### 2.3 The rules that bind (summary)

1. **No colour-only states.** Use value (≥3:1), shape or text ([W3C 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html); [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
2. **Identifying graphics and state indicators need ≥3:1 against adjacent colours.** Disabled controls are exempt; dormant ones are not ([W3C 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
3. **Auto-starting motion beside other content stops within 5 s, or the user can stop it** ([W3C 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)).
4. **Under Reduce Motion, honour Apple's list:** "reducing automatic and repetitive animations, including zooming, scaling"; "Replacing transitions in x-, y-, and z-axes with fades"; "Avoiding animating into and out of blurs" ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
5. **"Make motion optional… avoid using it as the only way to communicate important information"**, and supplement with haptics ([HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).
6. **"Generally avoid adding motion to UI interactions that occur frequently"** ([HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)). The tab bar is the most frequently touched surface in the app.
7. **Badges are for critical info.** "Reserve badges for critical information so you don't dilute their impact" ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).

### 2.4 RECOMMENDATION: the centre button "charges"

**One idea, used everywhere:** *how full the disc is = how close you are to being in a room.* **Motion appears only when a new action becomes available.** Being in a room is a status, so it is quiet.

The brand colours never leave the mark; only figure and ground swap:
- In (a) and (b) the **mark is the brand gradient on a dark glass disc**.
- In (c) and (d) the **disc is the brand gradient and the mark is ink**.

This answers the repo's objection ("a logo that changes colour… is not a logo"): the logo is always the gradient mark; what changes is whether it is printed *on* the gradient or *in* it. It also satisfies the chosen direction ("brand gradient for the Blend'n mark and the one primary action"), because in (c) check-in *is* the one primary action of the whole app.

#### The four states

| | (a) idle: "What's on" | (b) today: "Tonight" | (c) check-in: "Come in" | (d) live: "Room" |
|---|---|---|---|---|
| **Container** | Glass disc (same material as the bar), 1pt inner hairline at ~12% white | Same as (a) | **Disc filled with the brand gradient** (#F05423 bottom-left → #BE5C71 → #8E4BAA top-right) | **Same gradient fill** |
| **Mark** | Brand-gradient monoline (`monogram-gradient.png` already exists) | Same | **Ink** (`#1B1931` or `#0D0C0C`; 4.88:1 on the orange end, 3.48:1 on the violet end) | Ink |
| **Rim / halo** | None | **2pt brand-gradient rim**, 3pt outside the disc (static; 3.48–5.58:1 against the page) | **Static bloom** at rest: e.g. `boxShadow: '0 0 12px 2px rgba(240,84,35,0.55), 0 0 28px 6px rgba(190,92,113,0.30)'` | **None.** Quiet when you're in |
| **Marker** (at 1–2 o'clock, ringed 2pt in page colour so it reads as cut out) | None | None | **Hollow white ring** ("door open"): 8pt, 2pt stroke | **Solid green dot** (#30D158, 9.66:1 vs page). When unread > 0 it is **replaced** by the count pill (below) |
| **Text** | none | none (VoiceOver: "Open tonight's event") | **Glass pill above the disc: "Check in · {venue}"**, shown only in this state; tapping it equals tapping the disc | none (VO: "Open the room. 3 unread messages") |
| **Grayscale screenshot test** | Dark disc, mid-grey line mark | + a light ring | **Polarity flip**: light disc, dark mark, a soft halo, a ring marker, plus text | Light disc, dark mark, no halo, a solid dot or count |
| **Ongoing motion** | None | None | None after the entry burst (below) | None |

Why (c) is louder than (d), even though (d) is "further along": attention should track **need for action**, not "level". The Live Activities HIG's "update only when new content is available" is the same principle ([HIG](https://developer.apple.com/design/human-interface-guidelines/live-activities)). (d) is held for hours; a glowing (d) would be a light that is always on, so people stop seeing it.

Why a hollow ring for (c) and a solid dot for (d): white versus green is only about 2:1 in luminance, so in grayscale or with deuteranopia they could merge. **Hollow vs solid** is a shape difference that survives both. The repo's own comment asks for "two different marks, not one at two volumes", and this makes them two *shapes*.

#### Transitions (all on the UI thread with Reanimated; durations are starting points)

| From → to | Animation | Haptic | Under Reduce Motion |
|---|---|---|---|
| a → b | The rim **draws on** (`strokeDashoffset` full → 0, 450 ms ease-out) | none | 200 ms fade-in |
| b → c, or a → c | The **gradient rises inside the disc** from the bottom (translateY of a LinearGradient in an `overflow:hidden` circle, 500 ms, ease-out). The mark crossfades gradient → ink at 50%. The rim dissolves into the bloom. **Optional one-shot sheen**: the gradient stops slide (Reanimated `gradient` prop, 700 ms). That is where the owner's "palette transition" lives: decoration on a state that the fill already signals. Then the bloom **breathes 3 times** (opacity 0.55→0.25→0.55, ~1.6 s per breath, ≤5 s total) and **holds** at rest | one `impactAsync(Medium)` if the app is foregrounded | Instant (or 200 ms) crossfade to the final still; no rise, no sheen, no breathing (`withRepeat(…, 6, true)` will not start under `ReduceMotion.System`, so the at-rest frame must already be complete) |
| re-entering c on app foreground | Repeat the 3-breath burst at most once per foreground (tune by testing) | none | none |
| c → d (check-in succeeded) | The bloom **collapses into the disc** (shadow radius 28→0, 350 ms). **One ripple ring** expands from the disc edge (scale 1→1.35, opacity 0.6→0, 600 ms). The hollow ring **fills** into the green dot. This is the "you're in" moment; a fuller celebration belongs on the Room screen, not the tab bar | `notificationAsync(Success)` | Crossfade, no ripple; the haptic stays (HIG: supplement with haptics) |
| d → a (checked out / event over) | The fill **drains** downward (400 ms); the dot fades | none | Crossfade |
| d: unread 0 ↔ n | The existing `popIn`/`popOut` on the count; the digit changes in place | none | Instant |
| Low Power Mode (any) | Treat it as Reduce Motion for the breathing burst and the sheen; keep the one-shot fill and ripple | — | — |

#### The unread badge
- It appears **only in (d)**, as now, and takes the marker's slot rather than adding a second mark.
- Style it as a **white pill with ink digits** (19.5:1) and a 2pt page-colour cut-out ring, capped at "9+".
- Do **not** use the iOS red `#FF453A`. White on it is **3.41:1**, which fails 4.5:1 for small digits, and red beside the orange fill is only a hue difference.
- One app-wide unread style must be chosen. If Banter's tab uses a different badge, align both to this one.

#### Building it on the current stack (no new dependencies)
- **Fill.** `expo-linear-gradient` inside the existing 56pt disc with `overflow: 'hidden'`. Animate `translateY` for the rise and drain.
- **Rim and draw-on.** A react-native-svg `Circle` with a `LinearGradient` stroke, driven by `useAnimatedProps` on `strokeDashoffset`.
- **Bloom.** RN New Architecture `boxShadow` with two layers (static). Animate only its opacity during the ≤5 s burst.
- **Mark.**
  - Now: crossfade `monogram-gradient.png` (a, b) ↔ `monogram-white-bold.png` tinted ink (c, d). Both are already in the bundle.
  - Later: ask the designer for the **vector** monogram. That unlocks a true gradient stroke and a draw-on of the mark itself for onboarding or the splash.
- **Glass base.** `expo-blur` (Android: `BlurTargetView` + `dimezisBlurViewSdk31Plus`) or `expo-glass-effect` on iOS 26. Do not put `GlassView` under an opacity animation.
- **Motion gating.** Reanimated's default `ReduceMotion.System` plus `useReducedMotion()` for the JS branches. Low Power Mode needs a native read of `isLowPowerModeEnabled`, which is not in the stack (it could be a small Expo module, or skipped at first).
- **Skia: not needed.** Add it only if a later screen (the Room's match moment) needs shader-level effects.

#### What not to do on this button
- A perpetual breathing or pulsing halo. It was removed for good reasons (still-frame invisible, battery, "read as generated"), and it would violate 2.2.2 beside the Pulse feed.
- An orange↔violet palette cycle as *the* state.
- A rotating conic aurora border.
- Glowing in (d).
- A red badge on the orange disc.
- Styling (a) like "disabled". Idle is a working entry point to "What's on".

### Implication for Blend'n
- The brief should specify the centre button as **container polarity** (glass/outline vs gradient-filled) plus **one marker shape** plus **one label in (c)**.
- Motion is specified as one-shot transitions and a single ≤5 s attention burst. That gives the owner the "fill with gradient / neon glow" moment the owner asked for, keeps the repo's hard-won still-frame rule, and costs no new dependency.
- Two follow-ups for the brief:
  1. Get the vector monogram.
  2. Decide whether brand `#F05423` or app `#FF906D` is the orange.

---

## 3. "Alive" UI trends, 2025–26, filtered for a dark nightlife social app

### 3.1 Ambient mesh / aurora gradients (the brand orbs)
- **Evidence.**
  - "Aurora UI creates ambient gradients" for atmosphere (summary, [Fireart](https://fireart.studio/blog/the-best-web-design-trends/)).
  - Fireart also lists **"static gradients" as out**, with "kinetic versions now preferred" ([Fireart](https://fireart.studio/blog/the-best-web-design-trends/)).
  - Apple Music's moving artwork-blur is the canonical high-end example, and its web clone runs at **15 fps** ([aadishv.dev](https://www.aadishv.dev/music)).
- **RN.**
  - `expo-mesh-gradient` (`MeshGradientView`: `columns`, `rows`, `points`, `colors`, `smoothsColors`) supports iOS, Android and tvOS ([Expo docs](https://docs.expo.dev/versions/latest/sdk/mesh-gradient/)). It is not installed.
  - The orbs can also be 2–3 pre-blurred PNG/WebP blobs moved slowly with Reanimated transforms. That is cheaper than a live blur and needs no new dependency (reasoning).
- **Verdict: use**, as the backdrop behind *glass chrome* and on brand moments (onboarding, the Pulse header, the empty Room before anyone is in, the match moment).
  - Drift very slowly (tens of seconds per cycle, so it is not "information" and not a 0.2 Hz oscillation).
  - Freeze under Reduce Motion and Low Power Mode.
  - **Never put it behind content cards.** Per HIG, colour in the content layer fights glass controls ([HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)).

### 3.2 Grain / noise overlays
- **Evidence.**
  - "Tactile realism — grain and imperfections show 'a person made the thing, not a prompt'" ([Bubble](https://bubble.io/blog/web-design-trends/)).
  - Fireart calls film grain depth "at minimal performance cost" ([Fireart](https://fireart.studio/blog/the-best-web-design-trends/)).
  - Performance: a small tiled PNG (128–512px) is the efficient route. Per-pixel noise filters (SVG `feTurbulence`) "can be GPU-intensive, especially on mobile" ([UltimateDesignTools](https://ultimatedesigntools.com/blog/css-noise-textures-guide/), summary).
- **Verdict: use, sparingly.**
  - One static 256px noise tile at 3–6% opacity over the orb backdrop only. It kills gradient banding on OLED near-black, which is the real reason to do it.
  - **No animated grain.**

### 3.3 Variable fonts / kinetic type
- **Evidence.**
  - Satoshi (Indian Type Foundry, Fontshare) ships five weights 300–900 with obliques **plus variable files**, under the ITF Free Font License ([Fontshare](https://www.fontshare.com/?q=Satoshi); [uwarp guide](https://www.uwarp.design/blog/satoshi-font-guide), summary).
  - Kinetic type works best "as a single hero-level moment rather than something applied page-wide" ([Bubble](https://bubble.io/blog/web-design-trends/)).
- **RN gate.** "Android and iOS support variable fonts in SDK 58 and later. On earlier versions, use static font files". `fontVariationSettings` arrives with RN 0.88 / SDK 58 ([Expo Fonts](https://docs.expo.dev/develop/user-interface/fonts/)). **The client is on SDK 57**, so axis animation is not available yet.
- **Verdict:**
  - Static Satoshi weights now.
  - At most one kinetic moment: the match reveal or the "you're in" title, done with transforms, not weight axes.
  - Revisit weight-axis animation after the SDK 58 upgrade.

### 3.4 3D or glass icons
- **Evidence.** Airbnb's Lava icons ([It's Nice That](https://www.itsnicethat.com/articles/airbnb-app-redesign-140525); [OpenLava](https://github.com/OpenLavaFormat/OpenLava)). The counter-argument: AI can now fake the look ([One Thing](https://onethingnewsletter.substack.com/p/airbnbs-relaunch-and-the-texture)).
- **Verdict: skip.** The brand rule is outlined icons only, and there is no RN Lava player. The *tactile press* (squash) is the transferable part, and it is already shipped.

### 3.5 Photo-derived dynamic tint (cover colour tints the event page)
- **Evidence.**
  - Luma shifts "the entire screen's background color… to match the dominant hue" ([60fps.design](https://60fps.design/shots/luma-create-event-random-theme)).
  - Spotify's guideline: extract the artwork colour for the background, with a fixed dark fallback `#191414` ([Spotify](https://developer.spotify.com/documentation/design)).
- **RN.** `react-native-image-colors` wraps Android Palette, iOS UIImageColors and web node-vibrant, and works with Expo via prebuild ([GitHub](https://github.com/osamaqarem/react-native-image-colors)). iOS returns `background/primary/secondary/detail` and Android `dominant/vibrant/muted…` (same source), so normalise per platform. The alternative is computing it **server-side at upload** and storing a hex on the event row: free at runtime and consistent across platforms (reasoning).
- **Verdict: use, with guards.**
  - Tint only the **top ~40% of the event page** as a gradient into `#0D0C0C`.
  - Clamp lightness so white text keeps ≥4.5:1.
  - Fall back to the brand orb when the cover is grey or mono.
  - **Never tint the glass bar or the centre button**, which must stay brand-constant.

### 3.6 Live counters
- **Evidence.**
  - HIG: "a sports app might use numeric content transitions for score changes" ([HIG Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)).
  - SwiftUI `.contentTransition(.numericText())` animates only the digits that changed ([Create with Swift](https://www.createwithswift.com/animating-numeric-text-in-swiftui-with-the-content-transition-modifier/)).
  - Threads shows online-member counts in Communities (summary, [SocialBee](https://socialbee.com/blog/threads-news/)).
- **Verdict: use** for "24 here now" in the Room header and on today's event cards. Roll only the changed digit (Reanimated translateY per digit). Make it **instant under Reduce Motion**.
  - Show counts, not faces, before check-in. This matches the "blind regulars" product ruling in memory and the HIG's "avoid sensitive information" on the Lock Screen.

### 3.7 Presence / "who's here" stacks (facepiles)
- **Evidence.**
  - Facepiles are "a common way to show realtime presence… a horizontal row of image avatars" ([Interconnected](https://interconnected.org/more/2023/partykit/facepiles.html)).
  - Posh: "see what the vibe is and who's going" ([App Store](https://apps.apple.com/us/app/posh-create-find-events/id1556928106)).
  - Partiful shows guests after RSVP ([party.pro](https://party.pro/partiful/)).
- **Verdict: use, gated.**
  - Before check-in: a count plus *anonymous* avatar silhouettes, or animal avatars (the brand already uses animal avatars in group chat).
  - After check-in: real faces in the Room.
  - Cap at 3–5 faces + "+19". Ring each in page colour, not a gradient ring (avoid looking like Instagram, §1.12).

### 3.8 Celebration moments (match, check-in)
- **Evidence.**
  - Tinder rebuilt its "It's a Match!" screen with "enhanced and updated animations" in its Nov 2023 redesign ([Tinder Newsroom](https://www.tinderpressroom.com/2023-11-20-TINDER-INTRODUCES-DATING-BEYOND-PHOTOS-WITH-A-NEW-SUITE-OF-FEATURES), summary).
  - Duolingo scales celebration to the milestone: a small particle burst at 2 days, a full-screen takeover with a ticker at 50 ([60fps.design](https://60fps.design/shots/duolingo-50-day-streak-animation)).
  - Partiful's "boops" are a micro-celebration of someone joining ([party.pro](https://party.pro/partiful/)).
  - Anthropic's design guidance: "one well-orchestrated page load with staggered reveals… creates more delight than scattered micro-interactions" ([Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)).
- **Verdict: two celebrations only, scaled.**
  1. **Check-in**: small, on the button (§2.4 ripple + haptic).
  2. **Match**: the one full-screen moment. The two people's photos meet, the orb backdrop flares, Satoshi set large, a haptic, ≤1.5 s, skippable on tap (HIG "Let people cancel motion"). Reduce Motion gives a crossfade.
  - **No confetti.** It is the default "celebration" and reads generic.

### 3.9 Skeuomorphic touches
- **Evidence.** Airbnb's "texture era" ([One Thing](https://onethingnewsletter.substack.com/p/airbnbs-relaunch-and-the-texture)). Fireart lists "tactile brutalism" ([Fireart](https://fireart.studio/blog/the-best-web-design-trends/)).
- **Verdict:**
  - Tactility through **behaviour** (press squash, haptics, the fill "pouring" into the disc), not through rendered materials.
  - The one exception is glass itself on the chrome.

### 3.10 Bento layouts
- **Evidence.** In bento grids, "panel size reflects the importance of what's inside it" ([Bubble](https://bubble.io/blog/web-design-trends/)).
- **Verdict: use for the event page details** (time · venue · crowd count · dress code · price). Not for the Pulse: a feed of bento boxes is the "SaaS-card kit" (§3.12).

### 3.11 Sticky glass headers
- **Evidence.**
  - iOS 26 scroll views get a scroll edge effect by default. Content is "blurred and dimmed" near bars, with `.soft` vs `.hard` styles ([Hacking with Swift](https://www.hackingwithswift.com/quick-start/swiftui/how-to-adjust-the-scroll-edge-effect-for-scrollview-and-list)).
  - One developer reports the iOS 27 SDK changed the automatic top edge from soft to hard ([GitHub issue](https://github.com/tashda/Shellbee/issues/145)). **UNVERIFIED** beyond that single report.
  - HIG: colourful content may scroll under controls intermittently, but "make sure its default or resting state… maintains clear legibility" ([HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)).
- **Verdict: use** a glass header that is *transparent at rest over the orb/tinted area* and becomes glass on scroll. Never start a screen with text over glass over a photo.

### 3.12 What is now overdone / "AI slop", and where Blend'n is exposed

Sources:
- Anthropic's own guidance calls out "Overused font families (Inter, Roboto, Arial, system fonts)", "Clichéd color schemes (particularly purple gradients on white backgrounds)", and "Predictable layouts" ([Claude blog](https://claude.com/blog/improving-frontend-design-through-skills)).
- The current frontend-design skill names defaults that read as templated:
  - "**a near-black background with a single bright acid-green or vermilion accent**"
  - "the SaaS-card kit: content chopped into identical rounded cards"
  - template chrome such as all-caps labels
  - its core advice: "Spend your boldness in one place"
  ([anthropics/skills](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)).
- A 2026 practitioner catalogue lists ([Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)):
  - "VibeCode Purple"
  - "Dark mode as default… medium-grey body text and all-caps section labels"
  - gradient overuse
  - "Large colored glows and colored box-shadows"
  - icon-topped identical cards
  - emoji navigation
  - "Inter everywhere" and the Space Grotesk / Instrument Serif / Geist combos
- Others describe "glassmorphism cards with faint neon glow" and "a purple-to-blue gradient in the hero" as the signature AI look ([search summary of several 2025–26 posts](https://dev.to/james_anderson_h/the-purple-gradient-problem-why-ai-ui-all-looks-alike-and-how-to-fix-it-3j65)).
- Generic AI imagery and scroll-jacking are "out" ([Bubble](https://bubble.io/blog/web-design-trends/)).
- On glass: NN/g's glassmorphism guidance is "utilized sparingly" with "more background blur", plus user control over transparency ([NN/g](https://www.nngroup.com/articles/glassmorphism/)). Its iOS 26 study found legibility and restlessness problems ([NN/g](https://www.nngroup.com/articles/liquid-glass/)). A claim that NN/g's "2026 State of UX" ranks glass UI among the top contrast failures appeared only second-hand: **UNVERIFIED**.

**Blend'n's exposure is real.** Near-black + orange-red accent + violet gradient + glow + dark-only is, item by item, on these lists. The product reasons are legitimate (it is a nightlife app used in dark rooms), but they will not stop it *reading* as generated. Mitigations:
1. **Photography carries the colour.** Event covers and people are the colour. Brand gradient appears in exactly two places: the mark and the one primary action (state (c), the Check in CTA, the match). This is "spend your boldness in one place".
2. **Glass only on chrome** (bar, sticky header, sheets' grab area). Content cards are solid `#0D0C0C`/surface with photos, never frosted.
3. **Glow appears once**: the (c) bloom. Nowhere else, no coloured card shadows.
4. **Orbs are art, not wallpaper**: large, soft and slow, on brand moments only, never behind lists.
5. **Typography**: Satoshi is not on the slop font lists. Avoid all-caps micro-labels and the "badge above headline" pattern. Use sentence case.
6. **No emoji as UI.** Icons are outlined. Animal avatars are illustrations, not emoji.
7. **Lead with orange, not violet.** This avoids both "VibeCode purple" and District's purple.

### Implication for Blend'n
- The "alive" budget goes to four things:
  1. Slow orbs on brand moments.
  2. A cover-tinted top band on event pages.
  3. Rolling live counts.
  4. Two scaled celebrations (check-in on the button, match full-screen).
- Everything else stays solid, quiet and photographic.
- The only glow in the app is the centre button's (c) bloom. That is what makes it legible as *the* invitation.

---

## Appendix: things to verify before they go into the brief as fact
- DICE "animated QR an hour before doors" is from a 2019 trade article (summary). Confirm on a current DICE build.
- The Fever "happening now" filter is unverified.
- The iOS 27 scroll-edge default change rests on one GitHub issue.
- Voltra's Android Live Updates support has an open PR; release status is unknown.
- The NN/g "2026 State of UX" glass-contrast claim is unverified.
- The bloom values, breath count and durations in §2.4 are starting points to tune on a device, not measured.
