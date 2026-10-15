# Blendn+, the door pass, Go Live and blind offers: research and recommendations

Round 2 of the mobile redesign brief, for Claude Design. Researched 2026-10-03 with WebSearch and WebFetch.

- Every claim carries a URL.
- **UNVERIFIED** means only a secondary or single source was found, or the page could not be fetched.
- **REC** marks a recommendation or starting value of ours. It is not a research finding.
- The owner rulings are taken from `.context/plans/product-completion-plan-v2.md` (§2, §5, §9.3, D-7…D-20, steps 11–12) and the brief. Where the research pushes against a ruling, the item is listed in §E rather than changed.

**Owner rulings this document relies on**

- **Blendn+ prices:** ₹199/mo · ₹499/quarter · ₹1,499/yr · Night Pass ₹49.
  - Sold by Apple/Google IAP through RevenueCat. Razorpay is never used inside the app.
- **Plus buys:** stay live while I'm here, partner perks, full night history (free keeps 3 nights), cosmetics, and crew extras (crew photo, custom emblem colours).
- **Never sold:** who liked you, cap bypass, seeing a venue without going live, reveal bypass, boosting.
- **Launch:** each city launches a season with everything unlocked. A 14-day trial runs when the gate flips. A referral gives 1 month free for 3 friends who check in.
- **Edge-case rulings:**
  - D-11: if Plus lapses during "stay live", the session falls back to a 20-minute end.
  - D-16: Night Passes stack, extending from the current end.
  - D-8: an offer audience under 5 is refused, with no count shown.
  - D-7: a regular means 3+ nights in 30 days, counting only visits after the claim.

---

## 0. The decisions on one page

| # | Decision | Why (short) |
|---|---|---|
| 1 | **Two paywall surfaces.** A small **"Tonight" sheet** opens at the moment of need: a Stay tap, a session expiring, or a locked perk. A **full Blendn+ page** opens from Profile/Settings. There is no onboarding paywall. | Contextual paywalls catch peak intent (§A1). The core loop is free by ruling. For Blendn, "day 0" is the first night out, not the install. |
| 2 | On the full page, the **monthly plan is the default**. Yearly shows "Save 37%". An A/B test of a yearly default comes later. | Monthly dominates in APAC/MEA, with young users, new brands and "natural endpoint" uses like dating. RevenueCat says so, against the Western annual-default playbook (§A1). |
| 3 | **The billed price is always the biggest number.** "₹1,499 a year" is large; "about ₹125 a month" is small and secondary. | Google Play lists "annual subscriptions that most prominently display their pricing in terms of monthly cost" as a violation (§A2). About 93% of Blendn traffic is Android. |
| 4 | The **Night Pass is presented as "Just tonight · ₹49 · doesn't renew"**. It is a separate row, never a plan card that looks like a subscription. | It is a different product type on both stores (§A2). Saying "doesn't renew" is the strongest trust signal against India's "subscription trap" and "SaaS billing" rules (§A3). |
| 5 | **A "Never for sale" line goes on the paywall.** | This is the memorable detail. It turns an owner ruling into the honest-paywall trust signal (§A4). |
| 6 | **The free option always gets a full button.** At expiry, "Extend 20 min, free" is the **primary** (gradient) action. Plus sits below it as a full-width glass button. | The CCPA's own "interface interference" example is a light "NO" next to a bold "YES" (§A3). |
| 7 | **Cooldowns:** a system-initiated upsell shows at most once per night per trigger and at most 2 per 7 days. After 3 dismissals in 30 days, system upsells stop for 30 days. A user's own tap on a locked item always opens the sheet. | Superwall's frequency-limit rationale, plus India's "nagging" definition (§A5). |
| 8 | **Door pass = "the pour":** a live gradient liquid in the disc that **stays level when the phone tilts**, with a ticking Geist Mono clock. **Staff press and hold "Redeemed"** on the guest's phone. There is no QR code. | Masabi's accelerometer bubbles, Google Wallet's motion-triggered security shimmer, and DICE/SafeTix's "animated so you can't screengrab" (§B). |
| 9 | **Go Live sheet = WhatsApp/Find My pattern:** three fixed durations plus one open-ended choice (20 / 45 / 60 / Stay). The pill shows minutes, then mm:ss for the last 5. One warning goes out at T-5. | It is the established mental model for timed presence (§C1). |
| 10 | **Centre button:** an event room shows a **full** gradient disc. A venue live session shows a disc whose **fill level is the time left**. A "Go live · ‹venue›" pill invites the action. | This extends round 1's "how full the disc is" rule (§C7). |
| 11 | **Offers explain themselves** ("Why you got this"). The venue never learns who got them, and the copy says so. Promotional push needs an explicit opt-in and its own Android channel. | Apple 4.5.4, the HBR transparency research, and DPDP withdrawal "comparable to giving" (§D). |

---

## A. Blendn+ paywalls

### A1. What the data says converts (2025–26)

| Finding | Source |
|---|---|
| Hard paywalls reach a **10.7%** median day-35 trial-to-paid rate against **2.1%** for freemium, and about 8× revenue per install by day 60. **One-year retention is about equal (27% vs 28%).** | [RevenueCat SOSA 2026 summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026) |
| Long trials (17–32 days) convert at **42.5%** and short ones (<4 days) at **25.5%**. **55.4%** of 3-day-trial cancellations happen on day 0. | [RevenueCat SOSA 2026 summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026) |
| **Google Play billing failures cause 31% of cancellations**, against 14% on the App Store. | [RevenueCat SOSA 2026 summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026) |
| 35% of annual subscribers cancel in month 1. Annual reactivation is about 5%, and monthly subscribers come back at 4× that rate. | [RevenueCat SOSA 2026 summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026) · [9to5Mac](https://9to5mac.com/2026/05/27/new-report-shows-annual-app-subscribers-rarely-return-after-they-cancel/) |
| 82% of trial starts happen on the day of install (2025). Adapty puts it at 89.4% on day 0 (2026). | [RocketShip summary of SOSA 2025](https://www.rocketshiphq.com/revenuecat-state-of-subscription-apps-2025-summary/) · [Adapty 2026](https://adapty.io/state-of-in-app-subscriptions/) |
| India sits far below global medians on price and has among the lowest trial-to-paid rates. | [Adapty 2025 report, via search summary](https://adapty.io/reports/state-of-in-app-subscriptions-2025/) (**UNVERIFIED**: the page body was not readable) |
| **Monthly plans "are notably more popular" in MEA and Asia-Pacific.** Gen Z and under-34s prefer shorter commitments. Monthly suits low-trust new brands and "short-term use cases… dating apps". | [RevenueCat: Monthly plans might be your best option](https://www.revenuecat.com/blog/growth/monthly-subscriptions-when-to-offer) |
| Default to the longest plan: "10–30% LTV uplift is common". Show "1–3 options max, with a clear winner". "Trigger after value, not before." | [Superwall best practices](https://superwall.com/blog/superwall-best-practices-winning-paywall-strategies-and-experiments-to) |
| "Lead with annual plan and ensure there is only one choice to make." "Most Popular" beat highlighting the cheapest. Context screens before a paywall lifted trial opt-in from 2% to 15%. Use progressive disclosure. | [RevenueCat: how top apps approach paywalls](https://www.revenuecat.com/blog/growth/how-top-apps-approach-paywalls) |
| "(equivalent to XX/month)" next to the yearly price helps in monthly-anchored markets. Hiding monthly behind "View all plans" lifts yearly uptake by 15–20%. | [RevenueCat paywall guide](https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps) · [RevenueCat search summary](https://www.revenuecat.com/blog/growth/paywall-redesigns-case-studies) (**UNVERIFIED**: the 15–20% figure comes from a search summary) |
| Blinkist's "honest paywall" (trial timeline plus a reminder before the charge) is reported at **+23% trial conversion** and **−55% complaints**. | Numbers: [Subscription League podcast page](https://subscriptionleague.com/episode/blinkist-using-transparency-to-increase-your-conversion-rate-with-eveline-moczko), via search summary (**UNVERIFIED**). The direction (higher conversion, fewer billing complaints) is confirmed by [RevenueCat](https://www.revenuecat.com/blog/engineering/how-to-build-a-blinkist-style-paywall-using-revenuecat-webhooks-and-zapier). |
| Contextual (feature-gate) paywalls convert better per impression than cold ones. One secondary source gives 8–20% vs 5–12%. | [Growthwaves](https://growthwaves.substack.com/p/dont-stop-at-the-onboarding-paywall) · (**UNVERIFIED** numbers) |

**What this means for Blendn**

- The hard-paywall numbers do not apply, because the core loop is free by ruling.
- The "day 0" insight does apply, reinterpreted: **Blendn's day 0 is the first night at a venue.** Someone standing in Toit with 2 minutes of live time left is the highest-intent moment the product has.
- India's low trial-to-paid rate and its monthly preference both argue for **monthly as the default**, with a ₹49 one-night entry point.
- Annual should be visible and should show its real saving. Test a yearly default once there is traffic.

### A2. What the stores require

**Apple**

- **3.1.1:** "you should make sure you have a restore mechanism for any restorable in-app purchases." ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **3.1.2(a):** an auto-renewable subscription must "provide ongoing value" and last "at least seven days". So the **Night Pass cannot be an auto-renewing subscription.** ([guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **3.1.2(c):** "Before asking a customer to subscribe, you should clearly describe what the user will get for the price." It also bans "bait-and-switch". ([guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **5.6:** apps must not "trick them into making unwanted purchases… or engage in any other manipulative practices". (Text confirmed via [search of the guidelines page](https://developer.apple.com/app-store/review/guidelines/); the fetch truncated before §5.)
- **Schedule 2, §3.8(b)** requires, on the purchase screen:
  - the subscription title
  - its length
  - its price "and price per unit if appropriate"
  - working links to the Privacy Policy and the Terms of Use (EULA)

  This must be shown "clearly and conspicuously… without requiring additional action", and the StoreKit sheet alone is not enough. ([RevenueCat on 3.8(b)](https://www.revenuecat.com/blog/engineering/schedule-2-section-3-8-b) · [Schedule 2 PDF](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf))
- **Product types:** Apple has consumable, non-consumable, auto-renewable and **non-renewing subscription** ("access… for a limited time… must purchase them each time"). ([Apple IAP](https://developer.apple.com/in-app-purchase/))
  - Non-renewing purchases are not restored by StoreKit's restore. The app must restore them from its own account. ([Apple forums](https://developer.apple.com/forums/thread/22345))
  - Blendn has server accounts, so the plan's choice of non-renewing for the Night Pass works.

**Google Play** ([Subscriptions policy](https://support.google.com/googleplay/android-developer/answer/9900533))

- You must "clearly and explicitly disclose your offer terms, the cost of your subscription, the frequency of your billing cycle, the automatic renewal terms".
- For trials, you must say "how and when a free trial will convert… how much… and how a user can cancel".
- **Listed violations include:**
  - "Annual subscriptions that most prominently display their pricing in terms of monthly cost"
  - "Multiple screens in the purchase flow that lead users into accidentally clicking the subscribe button"
  - SKU names like "Free Trial"
- **Cancellation:** apps must "include in your app access to an easy-to-use, online method to cancel". A link to Play's Subscription Center satisfies this.
- **Prepaid plans** are non-auto-renewing base plans of **1 day to 1 year**. Top-ups stack the end date. "Prepaid base plans do not support offers." RevenueCat notes they matter "for markets with auto-renewal restrictions, such as India". ([RevenueCat: Google prepaid plans](https://www.revenuecat.com/docs/subscription-guidance/google-prepaid-plans) · [Play Help](https://support.google.com/googleplay/android-developer/answer/12154973?hl=en))
- **One-time products** can be consumable, and since 2025 can also have **Rent** purchase options with a rental period. ([Android Developers Blog, Jul 2025](https://android-developers.googleblog.com/2025/07/new-tools-to-help-drive-success-for-one-time-products.html) · [docs](https://developer.android.com/google/play/billing/one-time-product-multi-purchase-options-offers))
- **New on 29 Sep 2026:** Google announced retention offers and plan change at cancellation, win-back offers, a **Dynamic Grace Period** ("matching the recovery window to the user's recovery likelihood"), and the In-App Messaging API "available now". ([Android Developers Blog](https://android-developers.googleblog.com/2026/09/unlocking-Google-play-subscription-growth.html))

**Prices and GST**

- **Both stores show Indian buyers tax-inclusive prices** and handle GST:
  - App Store prices in India "include local tax", which is 18% GST. ([pricepush](https://pricepush.app/blog/app-store-pricing-by-country), **UNVERIFIED** secondary; Apple's own note on [tax updates](https://developer.apple.com/news/?id=2s2oe3qf))
  - Google treats the set price as GST-inclusive in many countries and remits GST for India purchases. ([Play Console Help: tax rates](https://support.google.com/googleplay/android-developer/answer/138000?hl=en))
  - Plan v2 §5 already says to "confirm in each console's tax section".
- The INR price grid: Apple has 900 price points, with India ranging from about ₹9 upward. ([Apple newsroom PDF](https://www.apple.com/newsroom/pdfs/App-Store-Pricing-Update.pdf) · [NewsBytes](https://www.newsbytesapp.com/news/business/apple-changes-its-app-store-pricing-structure-worldwide/story)) **UNVERIFIED** whether ₹49 / ₹199 / ₹499 / ₹1,499 are exact App Store price points. Confirm in App Store Connect.

**REC: what this means for the Night Pass**

| Store | Product | Why |
|---|---|---|
| Apple | **Non-renewing subscription** (the plan's choice) | Auto-renewing needs ≥7 days. Blendn restores it from its own account. |
| Google | **One-time consumable** (the plan's choice) | The entitlement is "tonight, until 6 am", set by Blendn's server. A **1-day prepaid plan** stacks natively (D-16) but grants 24 hours, and Play's own subscription screen would then show an end time that contradicts "until 6 am". The **Rent** option is worth evaluating; **UNVERIFIED** whether its rental period fits a 06:00 cutoff. |

### A3. Consumer law: what an Indian regulator would call a dark pattern

The **Guidelines for Prevention and Regulation of Dark Patterns, 2023** (CCPA, notified 30 Nov 2023, under s.18 Consumer Protection Act 2019) name 13 patterns. Definitions below are quoted from the [Trilegal copy of the Guidelines](https://trilegal.com/wp-content/uploads/2023/12/Guidelines-for-Prevention-and-Regulation-of-Dark-Patterns-2023.pdf); the official notice is listed at [doca.gov.in/ccpa](https://doca.gov.in/ccpa/guidelins.php).

| Pattern | Definition (quoted) | The Blendn surface it threatens |
|---|---|---|
| **False urgency** | "falsely indicating that the quantities… are more limited than they actually are", including "displaying a false sense of popularity". Entities "will be required to prove that there was no 'false' sense of urgency". | "Most popular" badges, countdowns on offers, live-count copy |
| **Confirm shaming** | "emotionally charged design tactics to create a sense of fear, shame, ridicule or guilt" | The decline button on the paywall and the expiry sheet |
| **Subscription trap** | "making the cancellation… impossible or complex… hiding the cancellation option… requiring… payment details… to avail a free subscription". The commentary adds that cancellation should be available in a manner "similar to that of purchasing". | Manage/cancel, the 14-day trial |
| **Interface interference** | "Highlighting specific information or obscuring relevant information". The example given is a pop-up where "'NO' is shaded in a light-colour, whereas 'YES' is in bold and highlighted". | The expiry sheet (free extend vs Plus) |
| **Drip pricing** | "elements of prices… revealed surreptitiously or post confirmation… advertised as free without disclosing that continuing usage would attract extra costs" | Trial copy, Night Pass, "launch season" |
| **Nagging** | "repetitive and persistent requests… or notifications, in order to effectuate a transaction" | Paywall frequency, offer pushes |
| **SaaS billing** | "if a free trial is converted to a paid one without any notification… may be considered a dark pattern" | The trial ending |

- **June 2025:** the CCPA advised platforms to **self-audit within 3 months** and self-declare. ([CCPA press release PDF](https://consumeraffairs.gov.in/public/upload/admin/cmsfiles/pressRelease/Central_Consumer_Protection_Authority_issues_advisory_to_E-Commerce_Platforms_for_self-audit_within_3_months_to_detect_Dark_Patterns_and_ensure_its_resolutionpress_release.pdf) · [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2191948&reg=3&lang=2))
- **E-Commerce Rules 2020, r.4(9):** consent must be "expressed through an explicit and affirmative action", never "automatically, including in the form of pre-ticked checkboxes". ([legitquest text](https://www.legitquest.com/act/consumer-protection-e-commerce-rules-2020/91C8))
- **RBI e-mandate:** issuers send a pre-debit notification at least 24 hours before a recurring charge. Recurring charges up to ₹15,000 need no OTP. ([Probe42 summary of RBI circular](https://resources.probe42.in/regulatory-updates/rbi-circulars/rbi-circular-processing-of-mandate/) · [BusinessToday, Apr 2026](https://www.businesstoday.in/personal-finance/news/story/rbi-caps-recurring-payments-at-rs15000-without-otp-under-new-e-mandate-framework-526759-2026-04-21)) The stores handle this. It is context for why Indian renewals fail more often.
- **EU (for completeness; Blendn is India-only):** DSA Art. 25(1) bans interfaces that "deceive or manipulate… or… materially distort or impair" free decisions. ([DSA Library](https://dsa-library.com/article/25/))

### A4. REC: the paywall, drawn

**Surface 1: the "Tonight" sheet** (a bottom sheet over the venue room or the Go Live sheet)

Use it for user-initiated taps (Stay, a locked perk, a locked night) and for the Plus row of the expiry prompt (§C4).

```
[outlined icon: disc with level line]
Stay live while you're here
Blendn+ keeps you live at Toit for as long as you're inside, up to 4 hours.

┌───────────────────────────────────────────────┐
│ Just tonight                         ₹49      │
│ Until 6 am · doesn't renew                    │
└───────────────────────────────────────────────┘
┌───────────────────────────────────────────────┐
│ Blendn+ monthly                  ₹199/month   │
│ Stay live anywhere, perks, all your nights    │
│ Renews monthly · cancel anytime               │
└───────────────────────────────────────────────┘
            [ Continue — ₹49 ]            ← gradient, follows the selection
            See all plans · Not now
Prices include GST. Terms · Privacy · Restore purchases
```

- **Default selection: "Just tonight".** It is the honest match for "I'm here tonight". It is also the cheapest commitment, which suits India's conversion profile (§A1).
- **There is one button.** The CTA label carries the selected price, so nothing is hidden (drip pricing).
- **"Not now" is plain text with no guilt** (confirm shaming). Never write "No thanks, I'll leave early".
- When a launch-season or trial entitlement applies, the sheet is skipped and the action just works. Show a one-line toast instead: "Free during launch in Bengaluru — until 30 Nov."

**Surface 2: the full Blendn+ page** (Profile › Blendn+, Settings, "See all plans")

It is a **single scrolling page, not a multi-step flow**. Google lists multi-screen flows that lead to accidental subscribes as a violation (§A2).

1. **Header:** the Blendn mark (gradient, as ruled) and "Blendn+" in Satoshi. One line: "More of the night, none of the creepy stuff."
2. **What you get.** Four rows, outlined icons, benefit first:
   - "Stay live while you're there — no timer while you're inside, up to 4 hours"
   - "Partner perks at venues on Blendn"
   - "Every night you've been out, not just the last 3"
   - "Crew extras — a crew photo and your own emblem colours" · "Profile cosmetics"
3. **"Never for sale"**, a quiet panel in a hairline border. This is the memorable detail:
   > **Never for sale, on any plan**
   > Who liked you · A way past the limits everyone has · A look inside a venue you're not at · Seeing past someone's anonymity · Boosting yourself above others

   (These map one-to-one to the ruled list: who liked you, cap bypass, seeing without going live, reveal bypass, boosting. Which cap "cap bypass" means is not stated in the plan. Name it concretely once confirmed.)
4. **Plans.** Three cards stacked vertically with Geist Mono prices. **Monthly is preselected.**

   | Card | Big (billed) | Small |
   |---|---|---|
   | Monthly | **₹199 / month** | "Billed monthly" |
   | Quarterly | **₹499 / 3 months** | "About ₹166 a month · Save 16%" |
   | Yearly | **₹1,499 / year** | "About ₹125 a month · Save 37%" |

   Then a separate row, set apart with a divider: **Just tonight — ₹49 · until 6 am · doesn't renew**.

   - Compute savings from the **store's localized prices at runtime** (RevenueCat `priceString` / price), never from constants. ₹1,499 vs 12 × ₹199 = ₹2,388 gives 37.2%. ₹499 vs 3 × ₹199 = ₹597 gives 16.4%.
   - **No "Most popular" badge until the data says so.** False-popularity claims carry a reverse burden of proof (§A3).
5. **Trial block**, only when eligible (use RevenueCat's intro-eligibility check). This is the honest timeline:
   ```
   Today        Everything in Blendn+, free
   Day 12       We'll remind you
   Day 14       ₹199/month starts — cancel before then and you pay nothing
   ```
   A reminder before conversion is effectively required in India ("SaaS billing", §A3). The Blinkist evidence says it costs nothing (§A1). The plan uses a 7-day store intro offer and a 14-day trial at the gate flip; see §E.
6. **CTA (gradient, the one primary action):** "Start Blendn+ — ₹199/month", or "Start free trial" when eligible.
7. **Legal footer** (Schedule 2 + Google). Example for Android:
   > ₹199 a month, billed through Google Play. Renews automatically each month until you cancel. Cancel anytime in Google Play › Subscriptions; you keep Blendn+ until the end of the period you paid for. Prices include GST.
   > Terms · Privacy · Restore purchases

   On iOS: "…charged to your Apple Account… Renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings › Apple Account › Subscriptions." The 24-hour wording follows [RevenueCat's 3.8(b) template](https://www.revenuecat.com/blog/engineering/schedule-2-section-3-8-b).
8. **Close:** a "Not now" text button, always visible top-right, with no delay timer. Delayed or low-contrast close buttons are reported as 5.6 rejection triggers. ([RevenueCat community](https://community.revenuecat.com/general-questions-7/close-button-is-not-visible-on-android-4127), **UNVERIFIED** as policy.)

**Render it ourselves, or use RevenueCat Paywalls?** Use our own React Native screen. It must carry the "Never for sale" panel, the Night Pass row and the brand. RevenueCat's purchase SDK still does the buying.

### A5. REC: triggers, cooldowns and what to log

Superwall's rationale for frequency limits: "show this once per day… balance between number of paywall impressions (which increase conversions) with the potential impact on retention" ([Superwall docs: rules](https://superwall.com/docs/campaign-rules)). India's "nagging" pattern sets the ceiling (§A3).

| Trigger (`product_events.trigger`) | Kind | Surface | Cooldown (REC starting values) |
|---|---|---|---|
| `go_live_stay_tap`: Stay chosen in the Go Live sheet | user-initiated | Tonight sheet | none; it was a tap |
| `perk_locked_tap`, `history_locked_tap`, `crew_extra_tap`, `cosmetic_tap` | user-initiated | Tonight sheet (perk) or full page | none |
| `profile_plus_entry`, `settings_plus_entry` | user-initiated | full page | none |
| `live_expiry_prompt`: the Plus row inside the expiry sheet | system | expiry sheet (§C4) | Show the Plus row **once per venue day**. Later expiries that night show the free extend only. |
| `live_stay_lapsed`: Plus lapsed during Stay (D-11) | system | inline note, not a paywall | once per lapse |
| `launch_season_ending` / `trial_ending` | system | full page plus one push | once each, at T-3 days (trial at day 12 per the timeline) |

**Global rules (REC)**

- At most **2 system-initiated upsell impressions per 7 days**.
- **72 hours of quiet for a trigger after it is dismissed.**
- **3 system dismissals in 30 days stops system upsells for 30 days.** Passive "Plus" marks on locked items stay.
- **Never upsell:**
  - on a user's first Go Live
  - during the event hand-off (§C5)
  - inside a Live Activity or Live Update. Both Apple and Google forbid promotions there (§C1).
  - in a push, unless the user opted in to promotional pushes (Apple 4.5.4, §D1)

**Log every row** with:

- `trigger`, `surface`, `venue_id?`, `shown | suppressed_cooldown | suppressed_cap | suppressed_entitled`
- `dismissed | purchased(product_id) | restored`
- `ms_to_decision`, `entitlement_state_before`

### A6. Entitlement states and their UI (Settings › Blendn+, and badges)

The states and the access each gives come from [Google's subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions), with Apple equivalents from [Apple's retention tech talk](https://developer.apple.com/videos/play/tech-talks/111386/) and [App Store Connect: billing grace period](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions).

| State | Access | Settings › Blendn+ copy (REC) | Action |
|---|---|---|---|
| Launch season (city) | yes | "Blendn+ is free in Bengaluru during launch — until 30 Nov." | — |
| Trial | yes | "Free trial — ₹199/month starts 17 Oct. We'll remind you on 15 Oct." | Manage |
| Active (renewing) | yes | "Blendn+ monthly · renews 3 Nov · ₹199 · Google Play" | Manage in Google Play |
| Cancelled, still active | yes, until expiry | "Ends 3 Nov. You keep everything until then." | Resubscribe |
| **Grace period** (payment failed) | **yes**: "During a grace period, the user should still have access" | "Your payment didn't go through. Fix it in Google Play to keep Blendn+ after 6 Nov." | Fix payment (deep link) |
| **Account hold** (Android) / billing retry after grace (Apple) | **no**: "you should block access" | "Blendn+ is paused because the payment didn't go through. Fix it and it comes straight back." | Fix payment |
| Paused (Android, if enabled) | no | "Paused until 1 Dec." | Resume (Play deep link) |
| Expired | no | "Blendn+ ended on 3 Nov." | See plans |
| **Refunded / revoked** | no, **immediately** ("revoke… immediately") | "Blendn+ was refunded, so it's off." No blame, no ask. | See plans |
| Night Pass active | yes | "Night Pass · until 6 am" (stacked: "until 6 am Sun") | — |
| Referral month | yes | "A month on us — 3 friends checked in. Ends 3 Nov." | — |

- **Android payment-fix messaging:** Google renders a once-a-day snackbar with a deep link to fix payment during grace and hold ([Play lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions) · [RevenueCat on Play billing churn](https://www.revenuecat.com/blog/growth/google-play-billing-error-churn-how-to-fix)). With 31% of Play cancellations coming from billing failures (§A1), **enable the grace period and call it on app open.** **UNVERIFIED** whether `react-native-purchases` exposes it directly; check `showInAppMessages`.
- **iOS:** since iOS 16.4 StoreKit shows a Billing Problem sheet with no API call ([Apple tech talk](https://developer.apple.com/videos/play/tech-talks/111386/), via search summary).
- **Google warns:** "Don't remove access… while the user is still entitled". Doing so violates policy ([lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions)). Gate on the server entitlement, which comes from the RevenueCat webhook.

### A7. Restore and manage

- **Restore purchases** appears in the paywall footer and in Settings › Blendn+. Required by 3.1.1 (§A2).
  - For the Night Pass (non-renewing or consumable), "restore" means re-reading the server entitlement for the signed-in account.
- **Manage:**
  - Android: `https://play.google.com/store/account/subscriptions?sku=<id>&package=<pkg>` ([Play docs, via search summary](https://developer.android.com/google/play/billing/subscriptions)).
  - iOS: RevenueCat's `managementURL`, or `https://apps.apple.com/account/subscriptions`. `showManageSubscriptions` is not in the RN SDK ([RN SDK issue #816](https://github.com/RevenueCat/react-native-purchases/issues/816)).
- **Cancel is one tap from Settings › Blendn+ into the store.** A subscription trap is cancellation that is harder than subscribing (§A3).
  - Optional: [RevenueCat Customer Center](https://www.revenuecat.com/docs/tools/customer-center/customer-center-react-native) gives restore, refund request (iOS) and plan change with no custom UI. A cancellation survey is fine. A retention-offer screen that blocks the path to cancel is not.

---

## B. The door pass: a live, anti-screenshot pass

### B1. What others do

| Reference | Pattern | Source |
|---|---|---|
| **DICE** | No PDF, email or image of the ticket. Tickets are "activated in-app", and the QR shows "only… right before the event start time". The ticket is animated "so you can't screengrab it". | [Wikipedia](https://en.wikipedia.org/wiki/Dice_(ticketing_company)) · [TechCrunch 2016, via search summary](https://techcrunch.com/2016/08/26/dice-snags-6m-to-win-more-fans-for-its-frustration-free-ticketing-platform/?ncid=rss) (the "animated… screengrab" wording is **UNVERIFIED** beyond the summary) |
| **Ticketmaster SafeTix** | "barcode that automatically refreshes every 15 seconds"; "Screenshots won't get you in". It suggests Wallet for entry "even without internet". | [Ticketmaster UK help](https://help.ticketmaster.co.uk/hc/en-us/articles/13756245361297-SafeTix) |
| **Google Wallet** | Rotating TOTP barcodes, "typically every minute". The **security animation** is "a shimmering outline around the barcode… triggers only when the device is in motion so one can test the pass' validity by tilting the device". An optional screen lock on access. | [Redeem an Event ticket](https://developers.google.com/wallet/tickets/events/use-cases/redemption-methods) · [Rotating barcodes](https://developers.google.com/wallet/tickets/events/resources/rotating-barcodes) |
| **Apple Wallet** | iOS 18 enhanced/poster event tickets are **NFC-only** and need NFC approval. `relevantDates` drives the Event Guide and lock-screen relevance. | [Passcreator](https://www.passcreator.com/en/solutions/enhanced-event-tickets-in-apple-wallet) · [WWDC24](https://developer.apple.com/videos/play/wwdc2024/10108/) |
| **Masabi / transit "visual validation"** | "coloured bubbles which move across the ticket". The accelerometer makes the bubbles "always rising upwards", and inspectors ask the passenger to rotate the phone. "This cannot be replicated by a pre-recorded video." | [UrbanThings](https://urbanthings.co/2023/11/29/anti-fraud-animation-for-a-more-secure-mobile-ticket-validation/) · [Masabi](https://blog.masabi.com/blog/how-to-progress-from-visual-bus-mobile-tickets-to-barcode-mobile-ticketing-2.0) |
| **Stamp Me** (loyalty) | "show staff the animated, time-stamped voucher to claim". No scanner. | [stampme.com](https://www.stampme.com/) |
| **Luma** | QR in the app or Wallet. The Wallet pass works "even if the guest doesn't have the Luma app or an internet connection". | [Luma check-in](https://help.luma.com/p/check-in) |
| **Eventbrite** | Tickets aren't available offline unless they were opened while online. | [Eventbrite: find your tickets, via search summary](https://www.eventbrite.com/help/en-us/articles/319355/where-are-my-tickets/) |
| **Swiggy Dineout** (India, staff side) | Staff "had no reliable way to match" payments to terminals. Adoption improved with "simple video walkthroughs" for busy hours. | [Dineout PM write-up, via search summary](https://sagararora80.medium.com/how-we-launched-qr-based-payments-for-qsrs-at-swiggy-dineout-747fa40dca14) (**UNVERIFIED**) |
| **Brightness** | `setBrightnessAsync` on Android "only applies to the current activity" and needs no permission. On iOS it "will persist until the device is locked". | [Expo Brightness](https://docs.expo.dev/versions/latest/sdk/brightness/) |
| **Screen capture** | `preventScreenCaptureAsync` uses FLAG_SECURE on Android and blocks screenshots on iOS 13+. `usePreventScreenCapture()` applies "for as long as the owner component is mounted". | [Expo ScreenCapture](https://docs.expo.dev/versions/latest/sdk/screen-capture/) |

**The lesson:** a static code can be screenshotted, so the real defences are:

1. a **server-side single use**
2. a **liveness signal a human can test** (tilt, ticking seconds)
3. a **date or day element** that makes yesterday's recording visibly wrong

Blendn venues have no scanners, and the ruling is "staff tap Redeemed". So the pass is a **human-verified liveness display plus a server write**. That is closest to Masabi and Stamp Me, not DICE.

### B2. REC: "The pour", Blendn's door pass

**Anatomy, top to bottom** (full screen, dark, glass chrome)

1. **Venue name** (Satoshi Bold, large), then **the offer** ("First drink on the house").
   - Small grey line: "Thu–Sun, before 10 pm · Today only".
2. **The disc**, about 62% of the screen width, the same disc as the centre button. Inside it, **the brand gradient as a liquid**:
   - **The surface stays level as the phone tilts.** It is driven by `expo-sensors` DeviceMotion, low-pass filtered. Tilt left and the liquid sloshes and settles level. This is the tilt test, borrowed from Masabi and Google Wallet. Staff say "tilt it" and see it respond.
   - A slow, low wave runs on the surface (about 4 s period). A few small bubbles rise through the liquid and **always rise toward the real "up"**, whichever way the phone is held.
   - The ink-coloured Blendn mark floats at the centre, using round 1's figure/ground flip: mark in ink, on the gradient.
3. **Live clock** in Geist Mono with ticking seconds: `21:42:07 · FRI 3 OCT`.
4. **Tonight's word.** A short word plus a tint shift of the liquid, from a **server-issued daily seed** (for example "AMBER"). Staff can learn "tonight's word" from their own dashboard or the Venue app if needed. A recording from another day is visibly wrong. **Optional**: drop it if staff never use it.
5. **The staff zone**, separated by a hairline:
   - "**Staff:** press and hold to redeem" on a full-width glass button.
   - Holding **fills the button like a pour** (about 1 s, with a light haptic tick).
   - On completion: a `notificationAsync(Success)` haptic, and the liquid **settles still and turns to a solid fill**.
   - A stamp appears: **"Redeemed 21:43"**.

**States**

| State | What shows |
|---|---|
| Not yet valid (outside the offer window) | Disc empty, glass outline, "Valid from 7 pm". No staff zone. |
| **Live** | As above |
| **Redeemed** | Solid disc, no wave or bubbles. "Redeemed at 21:43 · Toit". It stays visible as "used" for the rest of the venue day (resets at 06:00). Staff seeing this know not to pour twice. |
| Offline redeem | "Redeemed at 21:43 · will sync". Queued locally with the device timestamp. On sync the server accepts the first redemption (one per day). A rejection later reads "Already used today". |
| Expired / used | Disc outline only. "Your next pass: tomorrow from 7 pm" (only if the offer continues) |

**Behaviour**

- **Brightness:** raise to about 85%, not 100% (glare). This is a third-party tip ([neatpass](https://neatpass.app/learn/apple-wallet-brightness-barcode), **UNVERIFIED**) and matters less without a scanner. Restore on blur and background (Android: `restoreSystemBrightnessAsync`).
- **Capture:** `usePreventScreenCapture()` on this screen only. A screenshot is useless anyway, but blocking it stops people trying.
- **Offline:** the pass and its daily seed are fetched with the offer and cached. The animation and clock run locally. The redeem queues. Basement bars have no signal; Eventbrite's offline gap is the failure to avoid.
- **Reduce Motion:** the wave and bubbles stop. **The level-surface tilt response stays**, because it is user-driven and is the security function. The seconds keep ticking.
  - WCAG 2.2.2 exempts motion that is "essential" ([W3C 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)). This screen holds nothing else, so the essential exception applies.
- **No QR in v1.** Venues have no scanners, and the redeem is the in-app hold.
  - Later: Google Wallet supports rotating barcodes and the motion shimmer natively.
  - Apple's poster event tickets need NFC approval (§B1).
- **Why "hold" and not "tap":** the ruling says tap. A 1-second hold prevents a pocket or guest mis-tap on a single-use item, and visually *is* a pour. See §E.

**Copy**

- Entry from the offer card: "**Use at the door**"
- First-time explainer (once): "Show this to the staff. They'll hold the button to mark it used — it works once, today."
- A screenshot attempt on iOS shows black. Don't toast; silence is fine.

---

## C. Go Live: timed presence at a venue

### C1. What others do

| Reference | Duration choices / timing | Source |
|---|---|---|
| WhatsApp live location | **15 minutes, 1 hour, 8 hours**; "Stop sharing" in the chat | [WhatsApp FAQ, via search summary](https://faq.whatsapp.com/480865177351335/?cms_platform=android) · [Tom's Guide](https://www.tomsguide.com/how-to/how-to-share-your-live-location-in-whatsapp) |
| Find My / Messages | "for an hour, until end of the day, or indefinitely"; "Stop Sharing My Location" | [Apple Support (IN)](https://support.apple.com/en-in/105104) |
| Snap Map Ghost Mode | "3 hours, 24 hours, or Until Turned Off" | [Snapchat Support](https://help.snapchat.com/hc/en-us/articles/7012322854932-How-do-I-turn-on-Ghost-Mode) |
| Instagram Notes / Live | Notes last 24 h, only for mutuals or Close Friends. Live runs up to 4 h. | [Hootsuite](https://blog.hootsuite.com/instagram-notes/) · [TechCrunch](https://techcrunch.com/2020/10/27/instagram-extends-time-limits-on-live-streams-to-4-hours-will-soon-support-archiving/amp/) |
| Hinge | "Active now" / "Active today" are deliberately approximate. Bumble shows no activity status. | [Hinge help (403; via search summary)](https://help.hinge.co/hc/en-us/articles/4407140713747-Last-Active-Status) (**UNVERIFIED**; time windows from secondary sources only) |
| Spotify Jam | "If a host leaves, it'll end the Jam for everyone." | [Spotify Support](https://support.spotify.com/us/article/jam/) (a 12 h inactivity end is **UNVERIFIED**) |
| ParkChicago (ParkMobile) | "in-app notification appears 10 minutes prior to your session expiring… hitting Extend Time". Other cities allow a 5–30 min choice. | [ParkChicago FAQ](https://parkchicago.com/faq) · [Wilmington, via search summary](https://wilmington.parkmobile.us/) |
| Luma Live Activity | Starts 1 h before and stays until the event ends, max 4 h. "Open Ticket" from the Lock Screen and Dynamic Island. | [Luma help](https://help.luma.com/p/live-activities) |
| **Apple Live Activities** | Up to 8 h active, then up to 4 h more on the Lock Screen (12 h max). The HIG says don't offer one for tasks over 8 h, end immediately when done, and no ads or promotions. | [HIG Live Activities](https://developer.apple.com/design/human-interface-guidelines/components/system-experiences/live-activities) · [Apple forums](https://developer.apple.com/forums/thread/797676) · [9to5Mac](https://9to5mac.com/2022/09/26/iphone-14-pro-live-activities-guidelines/) |
| **Android Live Updates** | Must be **ongoing, user-initiated, time-sensitive**. "Inappropriate uses: Ads, promotions, chat messages…". Needs `POST_PROMOTED_NOTIFICATIONS` and `setRequestPromotedOngoing`. Chip "maximum width of 96dp". **Chronometer countdown** in the chip via `setUsesChronometer` + `setChronometerCountDown`. | [Android Developers: Live Updates](https://developer.android.com/develop/ui/views/notifications/live-update) |
| Android versions | Promoted treatment needs Android 16 QPR1 (API 36.1). `setChronometerCountDown` exists since API 24, so a plain ongoing notification can count down on every supported phone. | [Android Authority](https://www.androidauthority.com/android-16-qpr1-live-updates-3573399/) · [API ref (Xamarin mirror)](https://learn.microsoft.com/en-us/dotnet/api/android.app.notification.builder.setchronometercountdown?view=net-android-37.0&viewFallbackFrom=xamarin-android-sdk-12) |
| Samsung (big in India) | One UI 8 routes Android 16 Live Updates into the **Now Bar** (initially behind a developer toggle). Zomato reportedly shows delivery ETA there. | [Android Authority](https://www.androidauthority.com/one-ui-8-live-updates-support-3573794/) · [SamMobile](https://www.sammobile.com/news/one-ui-8-now-bar-support-food-delivery-app/) (stable rollout **UNVERIFIED**) |
| Expo | `expo-widgets` (Live Activities as React components, APNs push updates) went **stable in SDK 56, iOS only**. | [Expo blog, 18 Jun 2026](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo) |

**The shared pattern:** **three fixed durations plus one open-ended choice.** The open-ended one is the "trust" option, and each app spells out how to stop. Blendn's 20 / 45 / 60 / Stay is the same shape, and Stay is the Plus option.

### C2. REC: the Go Live sheet

A bottom sheet from the venue page or from the centre button's "Go live · Toit" pill.

```
Go live at Toit
People in Toit's room tonight see you by your nickname for today.
Outside the room, Toit only shows how many are live — never who.

   ( 20 min )  ( 45 min )  ( 1 hour )
   ( Stay while I'm here  ✦Plus )
     Keeps you live as long as you're at Toit, up to 4 hours.

            [ Go live ]                ← gradient
   You can end it anytime.
```

- **Default:** 20 min the first time, then the last-used choice. The shortest is the privacy-protective default; WhatsApp's own shortest is 15 min.
- **Stay without Plus:** the chip shows a small "Plus" mark. Choosing it opens the Tonight sheet (§A4) *over* this sheet. On purchase you return here with Stay selected. On "Not now" you return with your previous choice.
- **The live count line on the venue page uses the ruled buckets only:** "Under 5 live", "5–9 live" and so on. Never avatars, and never "your friend is here".

### C3. REC: the live pill and countdown

- **In-app pill** (glass, top of the venue room and the Home map):
  - "● Live · Toit · 32 min"
  - At ≤5 min it switches to mm:ss in Geist Mono: "● Live · Toit · 4:59", plus an **"Extend"** chip.
  - In Stay mode: "● Live · Toit · staying".
  - Tap opens the session sheet: time left, "+20 min", "End".
- **Minutes, not seconds, until the last 5.** A ticking clock for an hour is anxiety. Seconds matter only when an action is due. Round 1's rule: motion only when a new action becomes available.
- **Lock screen and status bar** (all Android first, since about 93% of traffic is Android):
  - **Android ≤ 16:** an ongoing notification. Title "Live at Toit", a chronometer counting down, actions **"+20 min"** and **"End"**. On Android 16 QPR1+, request promotion so it becomes a Live Update chip (≤96dp: an icon plus "32m"). Expo core does not ship a chronometer notification. **UNVERIFIED** whether `expo-notifications` can set it; plan a small config plugin or native module.
  - **iOS:** a Live Activity through `expo-widgets` (stable since SDK 56, and Blendn is on 57). Compact view: the disc glyph plus "32m". Expanded view: venue, time left, "+20 min", "End".
  - Stay mode lasts at most 4 h, inside Apple's 8 h guidance.
  - **Content rule (both platforms):** never an offer, a perk or a Plus upsell here (§C1).

### C4. REC: expiry warning and prompt

**T-5 minutes, once.** One rule for every duration keeps it simple. ParkChicago uses T-10, but that would be half of a 20-minute session.

- Foreground: the pill turns into the mm:ss state with "Extend". No sheet.
- Background: update the Live Activity or Live Update (an alerting update on iOS, used sparingly per the HIG). Otherwise a local notification: "**5 minutes left live at Toit.**" Actions: "+20 min" · "Open".

**At 0: the expiry prompt** (a sheet if the app is open; otherwise a notification that opens it)

```
Your live time at Toit is up
Still here?

   [ Extend 20 min — free ]                 ← gradient, primary
   [ Stay all night with Blendn+ · from ₹49 ]   ← glass, full width (once per venue day; §A5)
   Done for now
```

- **Why free gets the gradient:** the ruling is "extend free, or stay with Blendn+". The CCPA's interface-interference example is exactly the reverse styling (§A3).
- After "Done for now": "You're no longer live at Toit." Return to the venue page.
- **Stay mode endings:**
  - Leaving the area: a silent end, plus next time the app is opened, "You left Toit, so you're no longer live."
  - The 4 h cap: "You've been live at Toit for 4 hours. Still here?" with **Go live again**.
- **Plus lapses during Stay (D-11):** "Your Blendn+ ended, so you're live for 20 more minutes." Inline, not a paywall.

### C5. REC: "An event just started here", the hand-off

- **Push (copy ruled):** "An event just started here — tap to check in"
- **In-app** (replaces the live pill, as a sheet if the app is open):
  > **Friday Quiz just started at Toit**
  > The venue room has closed for the event. Check in to join the people here.
  > [ **Check in** ] ← gradient · Not now
- **End the venue Live Activity / Live Update immediately**, per the HIG's "end immediately". Never carry the countdown into the event.
- The centre button goes straight to state (c), "Check in · Friday Quiz" (§C7).

### C6. REC: refusals (never show a distance)

| Case | Copy |
|---|---|
| Out of range (ruled) | "**You're not at Toit yet.**" · sub: "Go live once you're inside." |
| An event is live here | "**Friday Quiz is on at Toit right now.**" · [ Check in to the event ] |
| Under 18 (existing under-18 accounts) | "Going live at venues is for 18+." No further detail. |
| Location off | "Blend'n needs your location to check you're at Toit." · [ Turn on location ] |
| Already live elsewhere | "You're live at Bob's Bar. Switch to Toit?" · [ Switch ] · Not now |

### C7. REC: the centre button, "live at a venue" vs "checked in to an event"

This builds on round 1's §2.4 (`.context/redesign/research-references-states.md`): "how full the disc is = how close you are to being in a room". Being in a room is quiet; motion only when an action becomes available.

| State | Disc | Marker | Pill above | VoiceOver |
|---|---|---|---|---|
| (c) check-in available at an event | gradient fill, bloom, ink mark | hollow ring | "Check in · Friday Quiz" | "Check in to Friday Quiz" |
| **(c′) Go Live available at a venue** | same as (c) | hollow ring | "**Go live · Toit**" | "Go live at Toit" |
| **(d-event) in an event room** | **full** gradient disc, no bloom | solid green dot or unread pill | none | "Open Friday Quiz room. 3 unread" |
| **(d-venue) live at a venue** | gradient **fill level = time left** (a static level, stepped each minute, never animated between steps), ink mark | solid green dot or unread pill | none until ≤5 min, then "**4 min · Extend**" (a new action, so motion is allowed) | "Open Toit room. Live, 32 minutes left" |
| (d-venue, Stay) | full disc plus a small level-line glyph in the marker slot | same | "Staying at Toit" only on change | "Open Toit room. Staying while you're here" |

- **Shape carries the difference, not colour.** A full disc versus a partially filled one survives a grayscale or deuteranopia check, matching round 1's hollow-vs-solid principle.
- **The drain is the brand's pour language in reverse:** your glass empties as the time runs out, and "Extend" refills it with a 400 ms rise, the same motion as round 1's b→c.

---

## D. The blind offers inbox

### D1. What the research says

| Finding | Source |
|---|---|
| Targeting feels fine when the data flowed **first-party**. It backfires when it feels like a third party got it ("as if a friend shared a secret"). **Transparency increased engagement:** "recommended based on your clicks on our site" gave +11% selection and +38% spend. The mitigators are trust, control and justification. | [HBS: Ads That Don't Overstep (HBR 2018)](https://www.hbs.edu/faculty/Pages/item.aspx?num=53707) · [PRWeb summary of the field test](https://www.prweb.com/releases/maritz_motivation_solutions_and_harvard_researchers_find_transparency_in_ad_targeting_leads_to_increased_engagement_and_purchasing/prweb15348802.htm) |
| Users rely on explicit labels ("Because you watched…") to understand personalisation, and naming the cause helps them judge relevance. | [NN/g: Individualized recommendations](https://www.nngroup.com/articles/recommendation-expectations/) |
| Google's "Why this ad" and Meta's "Why am I seeing this?" make the explanation one tap away. | [Google Safety Center](https://safety.google/intl/en_us/safety/ads-data/) · [LinkedIn on Meta](https://www.linkedin.com/pulse/why-am-i-seeing-ad-meta-updates-ads-transparency-reece-matthews) |
| **Apple 4.5.4:** push "should not be used for promotions or direct marketing purposes unless customers have explicitly opted in… via consent language displayed in your app's UI, and you provide a method in your app for a user to opt out". | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [history note, 2020](https://www.appstorereviewguidelineshistory.com/articles/2020-03-04-push-notifications-marketing-and-more/) |
| Android: separate promotional and transactional notification **channels** so users can mute offers without losing room messages. | [Android Developers: channels](https://developer.android.com/develop/ui/compose/notifications/channels) · [Braze](https://www.braze.com/resources/articles/what-are-notification-channels-anyway) |
| **DPDP Act s.6(4):** "the ease of withdrawal [must be] comparable to the ease of giving consent". **DPDP Rules 2025, r.3/r.4:** an itemised notice before consent, a separate consent per purpose, no pre-ticked boxes, and withdrawal "accessible at the same level". | [Indian Kanoon s.6](https://indiankanoon.org/doc/15072321/) · [PIB: DPDP Rules notified](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) · [matters.ai summary](https://www.matters.ai/compliance/dpdp/dpdp-rules-2025) |

**The design principle that follows:** an offer from a venue must read as **Blendn telling you something about a venue**. It must never read as **the venue knowing something about you**. The truth matches this: the venue never receives the list, and the copy should say so in plain words.

### D2. REC: where offers live and what a card looks like

- **Home:** Profile › "**Passes & offers**". There is also a quiet line on the venue page ("You have an offer here") and a push when an offer arrives (opt-in only, §D4).
- **Keep it separate from Blendn+ "Partner perks".** Perks are bought; offers are given. Give them separate sections and never mix their badges.

**Offer card**

```
TOIT                                         until Sun
First drink on the house
Thu–Sun, before 10 pm
                                     [ Use at the door ]
Why you got this ▸
```

**"Why you got this"** expands inline. This is the "Why this ad" pattern. Copy per audience:

| Audience (ruled) | Expanded copy |
|---|---|
| Regulars (3+ nights in 30 days) | "Toit sent this to everyone who's been there 3 or more nights this month. **Blendn picked who — Toit never sees the list.** Toit only sees how many were sent, opened and used." |
| Lapsed (no visit in 30 days) | "Sent to everyone who's been to Toit before but not in the last month. Toit doesn't know it's you." Never write "We miss you" from the venue; it implies the venue knows. |
| First-timers | "Sent to people on Blendn who haven't been to Toit yet. Toit doesn't know who." |
| Everyone live | "Sent to everyone live at Toit right now." |
| Footer (all) | "Offers only go to groups of 5 or more, so no one can be singled out. Turn off offers from Toit · Turn off all offers" |

- The ruled floor (an audience under 5 is refused, D-8) becomes a **user-facing privacy promise**, which is the "justification" lever from the HBR research.
- **The opened count:** the venue sees "opened". Say so ("how many were… opened"). Opening is the one action users might not expect to be counted.

### D3. REC: the redemption flow

1. Tap "Use at the door" to open **the pour** (§B2).
2. Staff hold "Redeemed" to see the solid disc and "Redeemed at 21:43".
3. The offer card moves to "Used" with the same stamp.
4. The venue's dashboard counter goes +1. No name is attached unless the person has opted in as a visible regular (§D5).

What showing the pass reveals, stated once on first use: "Showing your pass lets the staff see it's yours — that's all. Toit's dashboard only counts how many were used."

### D4. REC: consent for offer pushes (Apple 4.5.4, Android channel)

Ask **in context**: the first time an offer exists for you, or from Passes & offers. Never during onboarding.

```
Offers from places you go
Venues on Blendn can send offers to their regulars and newcomers.
They never learn who got them.

   [ Turn on offer notifications ]
   Not now
You can turn this off anytime in Settings › Notifications › Offers.
```

- **Android:** a separate channel named "Offers from venues", default importance. "Room & chat" and "Check-in & live" are their own channels.
- **iOS:** consent is recorded server-side (timestamp and copy version, DPDP r.4 style). The in-app toggle lives in Settings.
- Offers still appear in the inbox without push. Only the *push* needs the opt-in.

### D5. REC: "Let this venue know I'm a regular" (per venue, revocable)

This is offered on the venue page only to people who qualify (3+ nights in 30 days, after the claim). The wording follows DPDP's itemised notice: what, to whom, and how to undo it.

```
Let Toit know you're a regular?

Toit will see
  · your first name and profile photo
  · how many nights you've been to Toit since it joined Blendn

Toit won't see
  · your chats, who you met, or anywhere else you go

Why: so the staff can say hi or look after you.
Turn it off anytime — here, or in Settings › Privacy › Regulars.

   [ Let Toit know ]        Not now
```

- **The toggle is never pre-ticked** (E-Commerce r.4(9), DPDP r.4).
- **Undo:** once on, the same place shows "**Toit knows you're a regular** · Turn off". It is **one tap** with no confirmation sheet, because withdrawal must be comparable to giving consent (s.6(4)).
- After turning off: "Done — Toit no longer sees you as a regular. Offers to regulars still reach you without your name."

---

## E. Open questions for the owner

These are places where the research pushes against a ruling or the plan.

1. **"Tap Redeemed" vs "press and hold"** (§B2). Hold prevents accidental single-use redemption and draws the pour. Keep tap, or accept hold?
2. **Night Pass on Google:** a consumable one-time product (plan) vs a 1-day prepaid plan (stacks natively, but its 24 h contradicts "until 6 am") vs Rent (**UNVERIFIED** fit) (§A2).
3. **Trial length:** the store setup says a "7-day free intro" while §9.3 says "14-day trial when the gate flips". RevenueCat's 2026 data favours longer trials (§A1). Which one shows in the paywall timeline?
4. **Default plan on the full page:** monthly (India and evidence for young users and new brands) vs yearly (Western default playbook) (§A1). Start monthly and A/B later?
5. **Expiry prompt priority:** the free extend as the gradient primary (recommended, §C4) vs Plus as primary. Plus-as-primary is legal only if the free option stays a full-weight button. It is the riskier reading of "interface interference".
6. **"Tonight's word"** on the door pass (§B2): worth the staff-training cost, or drop it and rely on tilt plus seconds?

---

## F. Sources

**Paywalls and benchmarks**

- RevenueCat SOSA 2026: https://www.revenuecat.com/state-of-subscription-apps · summary https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026
- RevenueCat SOSA 2025: https://www.revenuecat.com/state-of-subscription-apps-2025 · https://www.rocketshiphq.com/revenuecat-state-of-subscription-apps-2025-summary/
- RevenueCat monthly plans: https://www.revenuecat.com/blog/growth/monthly-subscriptions-when-to-offer
- RevenueCat paywall guide: https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps
- RevenueCat top apps: https://www.revenuecat.com/blog/growth/how-top-apps-approach-paywalls
- RevenueCat Blinkist-style: https://www.revenuecat.com/blog/engineering/how-to-build-a-blinkist-style-paywall-using-revenuecat-webhooks-and-zapier
- RevenueCat 3.8(b): https://www.revenuecat.com/blog/engineering/schedule-2-section-3-8-b
- RevenueCat Google prepaid: https://www.revenuecat.com/docs/subscription-guidance/google-prepaid-plans
- RevenueCat Customer Center: https://www.revenuecat.com/docs/tools/customer-center/customer-center-react-native
- RevenueCat Play billing churn: https://www.revenuecat.com/blog/growth/google-play-billing-error-churn-how-to-fix
- Superwall: https://superwall.com/blog/superwall-best-practices-winning-paywall-strategies-and-experiments-to · https://superwall.com/docs/campaign-rules
- Adapty: https://adapty.io/state-of-in-app-subscriptions/ · https://adapty.io/reports/state-of-in-app-subscriptions-2025/
- 9to5Mac: https://9to5mac.com/2026/05/27/new-report-shows-annual-app-subscribers-rarely-return-after-they-cancel/

**Store rules**

- Apple guidelines: https://developer.apple.com/app-store/review/guidelines/
- Schedule 2: https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf
- Apple IAP types: https://developer.apple.com/in-app-purchase/
- Grace period: https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions
- Retention tech talk: https://developer.apple.com/videos/play/tech-talks/111386/
- Google subscriptions policy: https://support.google.com/googleplay/android-developer/answer/9900533
- Lifecycle: https://developer.android.com/google/play/billing/lifecycle/subscriptions
- One-time products: https://android-developers.googleblog.com/2025/07/new-tools-to-help-drive-success-for-one-time-products.html
- Sep 2026 subscriptions: https://android-developers.googleblog.com/2026/09/unlocking-Google-play-subscription-growth.html
- Play tax: https://support.google.com/googleplay/android-developer/answer/138000?hl=en
- RN manage subscriptions: https://github.com/RevenueCat/react-native-purchases/issues/816

**India and EU law**

- Dark Patterns Guidelines 2023: https://trilegal.com/wp-content/uploads/2023/12/Guidelines-for-Prevention-and-Regulation-of-Dark-Patterns-2023.pdf · https://doca.gov.in/ccpa/guidelins.php
- CCPA June 2025 advisory: https://consumeraffairs.gov.in/public/upload/admin/cmsfiles/pressRelease/Central_Consumer_Protection_Authority_issues_advisory_to_E-Commerce_Platforms_for_self-audit_within_3_months_to_detect_Dark_Patterns_and_ensure_its_resolutionpress_release.pdf
- E-Commerce Rules 2020: https://www.legitquest.com/act/consumer-protection-e-commerce-rules-2020/91C8
- DPDP s.6: https://indiankanoon.org/doc/15072321/ · Rules 2025 https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
- RBI e-mandate: https://resources.probe42.in/regulatory-updates/rbi-circulars/rbi-circular-processing-of-mandate/
- DSA Art. 25: https://dsa-library.com/article/25/

**Passes**

- DICE: https://en.wikipedia.org/wiki/Dice_(ticketing_company)
- SafeTix: https://help.ticketmaster.co.uk/hc/en-us/articles/13756245361297-SafeTix
- Google Wallet: https://developers.google.com/wallet/tickets/events/use-cases/redemption-methods · https://developers.google.com/wallet/tickets/events/resources/rotating-barcodes
- Apple Wallet enhanced tickets: https://www.passcreator.com/en/solutions/enhanced-event-tickets-in-apple-wallet · https://developer.apple.com/videos/play/wwdc2024/10108/
- Masabi / UrbanThings: https://urbanthings.co/2023/11/29/anti-fraud-animation-for-a-more-secure-mobile-ticket-validation/
- Stamp Me: https://www.stampme.com/
- Luma: https://help.luma.com/p/check-in · https://help.luma.com/p/live-activities
- Expo Brightness: https://docs.expo.dev/versions/latest/sdk/brightness/
- Expo ScreenCapture: https://docs.expo.dev/versions/latest/sdk/screen-capture/
- W3C 2.2.2: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html

**Timed presence**

- Find My: https://support.apple.com/en-in/105104
- Snap: https://help.snapchat.com/hc/en-us/articles/7012322854932-How-do-I-turn-on-Ghost-Mode
- WhatsApp: https://faq.whatsapp.com/480865177351335/?cms_platform=android
- Spotify Jam: https://support.spotify.com/us/article/jam/
- ParkChicago: https://parkchicago.com/faq
- Instagram: https://blog.hootsuite.com/instagram-notes/
- HIG Live Activities: https://developer.apple.com/design/human-interface-guidelines/components/system-experiences/live-activities
- Android Live Updates: https://developer.android.com/develop/ui/views/notifications/live-update
- One UI 8: https://www.androidauthority.com/one-ui-8-live-updates-support-3573794/
- Expo widgets: https://expo.dev/blog/ios-widgets-and-live-activities-in-expo

**Offers and privacy**

- HBS/HBR: https://www.hbs.edu/faculty/Pages/item.aspx?num=53707
- NN/g: https://www.nngroup.com/articles/recommendation-expectations/
- Google ads transparency: https://safety.google/intl/en_us/safety/ads-data/
- Android channels: https://developer.android.com/develop/ui/compose/notifications/channels
