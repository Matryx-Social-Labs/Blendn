# "The Grid" — Figma vs. Current Implementation

Figma frame: `1141:4951` ("The Grid"), file `Zi2KcUzhEcLRdqyit22LdQ`.
Current implementation: `components/screens/MatchScreen.tsx` (~1541 lines, lazy-loaded by the thin
`app/(tabs)/match.tsx` wrapper) — this is the tab currently labeled "Explore" in the bottom nav
(route name `match`, unchanged from the Pulse pass).

**Headline finding — unlike Pulse, this screen has NOT been touched by any Figma-alignment pass.**
No `components/ui/*` primitives are used, no "matches Figma's X" comments exist, and the card
layout is structurally different from Figma's design (two different card types in two different
layouts, vs. Figma's one unified card type in a single column). This is a bigger lift than Pulse
was.

---

## What Figma's "The Grid" actually shows

1. **Top bar** — identical pattern to Pulse: blurred, hamburger + accent "Blend'n" wordmark + bell
   (though rendered larger here, 24px vs Pulse's 16px — worth reconciling into one shared header
   component instead of duplicating, since this is now the 2nd screen needing it).
2. **Heading section** — "The Grid" (36px) + a live count/context line: "240 Curated Minds at
   *Future Echoes '24*" (event name in accent pink).
3. **Segmented toggle** — "Grid" / "Join Chat" pill switcher (Grid active).
4. **Filter chips row** — horizontal scroll: "All Attendees" (active, tinted glass) / "Designers" /
   "Founders" / "Engineers" / "Venture".
5. **Single-column list of large profile cards** (despite being called a "grid" — it's one column
   on mobile, ~424-436px tall each, rounded-32, subtle diagonal gradient bg). Each card has:
   - "FEATURED" tag (only on the top card)
   - 80px avatar with a colored ring + a small badge overlay (bottom-right)
   - Name (24px bold) + role/title line (e.g. "Principal @ Arclight Labs")
   - "CORE EXPERTISE" label + 2 tag pills
   - A **contextual info panel** (bg `#141313`, rounded-32) whose content varies per card:
     "12 MUTUAL CONNECTIONS" + avatar stack, or "SHARED INTERESTS" + text, or "ATTENDING LIVE" +
     status text, or "MUTUAL CONNECTIONS" + avatar stack again
   - Full-width "View Dossier" button (flat `#272525` pill)
6. **Final card in the list is an empty-state/CTA**, not a 6th profile: dashed border, "Expand
   Your Circle", "Unlock more profiles by connecting your LinkedIn or X account.", "Connect
   Socials" button.
7. **Floating Action Button** (56px gradient circle, bottom-right, ambiguous icon).
8. **Bottom nav** — Feed / Explore (active) / **Create** / Circles / Me. Note: Figma's nav *does*
   label the middle slot "Create" here (and shows text labels under every icon) — useful signal
   for the shared tab bar built during the Pulse pass, which currently has no labels and an
   unlabeled "+" for that slot.

## What the current Explore/Match screen actually has

- Header: "Blend'n Match" title + a refresh icon button, gradient bg — not the hamburger/wordmark/
  bell pattern.
- A "New joins" ephemeral toast-like pill (auto-hides after 4s) and a "Live at {event}" info row
  with an "Event Room" button that opens chat — real, useful features **not in Figma's mock**.
- Two different card types in two different layouts:
  - **"Recommended"**: horizontal snap-scroll carousel of `SimilarCard` (163×260, `borderRadius:24`)
    — photo, name+age, a "reason" pill (shared-interest label), time-ago chip, safety-menu button.
  - **"Also Here"**: 2-column `FlatList` grid of `StartupItem` (smaller variant of the same card
    shape) with a manual "Load More" button, not infinite scroll.
- No filter chips, no sort control, no segmented Grid/Chat toggle.
- No "Expand Your Circle" / social-account-linking CTA.
- No FAB.
- Client-side "Recommended" scoring already exists (shared interests + recency + profile
  completeness) — this is useful logic that doesn't map to any single Figma section but could back
  the "FEATURED" tag on whichever card scores highest.
- Both existing card components mix `APP_COLORS` tokens with several raw hardcoded hex/rgba values.

---

## Quick wins (low risk, no product decision needed)

- [ ] **Top bar** → same hamburger/wordmark/bell pattern as Pulse. Since this is now needed on a
  2nd screen, **extract a shared `components/GlassTopBar.tsx`** (or similar) instead of duplicating
  the inline JSX a 2nd time — this was flagged as a nice-to-have during Pulse but is worth doing
  now that there's a real 2nd caller.
- [ ] **Heading section** — add "The Grid" title + the live count/event-name subtitle (reuse
  `GradientText` for the accent-colored event name, same pattern as Pulse's "The Pulse" heading).
- [ ] **Filter chips row** — "All Attendees" + category chips. Needs a decision (see Open below)
  on what real taxonomy backs "Designers"/"Founders"/"Engineers"/"Venture", since no such field is
  confirmed to exist on attendee profiles yet.
- [ ] **FAB** — add the same `GlassSurface`-backed circular button pattern built for Pulse, stub to
  a "Coming soon" toast pending a real action decision (see Open below).
- [ ] **Raw hex sweep** on `SimilarCard`/`StartupItem` (`#111214`, `rgba(255,144,109,0.2)`,
  `#34C759`, etc.) → `APP_COLORS` tokens, while touching these files anyway for the redesign.

## Structural changes (the real work — card redesign)

- [ ] **Unify into one profile card component** matching Figma's single large-card design, used in
  a single-column vertical list — replacing both `SimilarCard` (horizontal carousel) and
  `StartupItem` (2-col grid). This is the biggest change in this pass: 80px ring-avatar + badge,
  name + role line, "CORE EXPERTISE" pills (reuse `components/ui/Pill.tsx`), a contextual info
  panel, and a "View Dossier" button (reuse `components/ui/GradientButton.tsx` secondary variant
  or a flat pill matching `#272525`).
- [ ] **Contextual info panel** — decide what real data backs each variant:
  - "SHARED INTERESTS" → **doable now**, real data (`interests` arrays already fetched per user).
  - "ATTENDING LIVE" → **doable now**, derivable from existing check-in/proximity state.
  - "MUTUAL CONNECTIONS" (+ avatar stack) → **not doable yet**, no mutual-connections/social-graph
    query exists anywhere in the codebase (confirmed — this needs a real backend feature; see
    backlog note below).
- [ ] **"FEATURED" tag** on the top card — map to the existing client-side recommendation score
  (`recommendedEntries`, already computed) rather than building new scoring logic.
- [ ] **Segmented "Grid" / "Join Chat" toggle** — restyle the existing "Event Room" chat-access
  button as a real segmented control (reuse pattern from `components/AppHeader.tsx`'s
  `SegmentedControl`, already built) instead of a separate conditional row.
- [ ] **"Expand Your Circle" / social-linking CTA card** — the LinkedIn/X account-connection
  feature this implies does not exist in the app (no OAuth linking flow beyond the existing Google/
  Apple *login* providers). Building the real flow is backend-and-more work; for this pass, either
  render the card as a static visual (with the button stubbed to a toast) or skip it — see Open
  Decisions.

## Open product decisions (need your call before implementing)

1. **Filter-chip taxonomy.** Are "Designers"/"Founders"/"Engineers"/"Venture" meant to filter on a
   real field (role/category on the profile)? If no such field exists on attendee profiles today,
   this needs either a schema addition (backend backlog) or the chips get scoped to whatever
   category data *does* exist (e.g. interests-based buckets) instead of literal job-function labels.
2. **Fate of existing features not in Figma's mock**: the "New joins" pill and the "Live at
   {event}" / "Event Room" row are real, useful, already-built features. Keep them (Figma's mock
   may just not show every state), fold "Event Room" into the new Grid/Join-Chat toggle (natural
   fit), or cut per the same "Figma only" precedent set on the Pulse screen? Your call — this
   wasn't asked for on this screen yet, so I haven't assumed it.
3. **Pagination model.** Keep the manual "Load More" button, or switch to infinite scroll to match
   Figma's plain continuous list (no visible pagination control in the mock)?
4. **FAB action.** Same open question as Pulse — Figma doesn't define behavior. Stub to a toast
   (recommended, consistent with Pulse) unless you already know what it should do here.
5. **Mutual-connections feature.** Confirmed not to exist anywhere in the codebase. Do you want a
   `blendn-admin` backlog entry opened for it now (so a future session can build the real query), or
   should the "Grid" redesign simply omit that contextual-panel variant for now and only ship
   "Shared Interests" / "Attending Live"?
6. **Social account linking (LinkedIn/X).** Same as above — real backend/OAuth work, not currently
   planned. Backlog it, or render the CTA card as inert/stubbed for now?

---

## Suggested sequencing

1. Quick wins (top bar extraction + heading) — no decisions blocking, and the top-bar extraction
   pays off immediately by de-duplicating Pulse's inline header too.
2. Resolve decisions 1 (filter taxonomy) and 5-6 (mutual connections / social linking) together —
   they determine how much of the card redesign is "real" vs. "stubbed."
3. Card redesign (the structural work) — once the above is settled so the contextual-panel logic
   isn't built twice.
4. Decisions 2-4 (existing-feature fate, pagination, FAB) — can be resolved in parallel with step 3
   since none of them block the card component work.
