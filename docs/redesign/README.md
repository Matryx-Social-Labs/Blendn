# Blend'n redesign: the Claude Design pack

Everything Claude Design needs to redesign the whole client app: a design system with glass chrome, the brand gradient, Satoshi, motion and haptics, then every screen on iOS and Android.

**Start here:** [`PROMPTS.md`](./PROMPTS.md). It lists what to upload, what never to upload, and the prompts in order.

**Already built Flows 1–8?** Go to [`PROMPTS.md` → Round 2](./PROMPTS.md#round-2--delta-prompts-and-new-flows-2026-10-03). It has delta prompts for the projects you've already built and new prompts for Flows 9–16.

| File | What it is | Who reads it |
|---|---|---|
| [`PROMPTS.md`](./PROMPTS.md) | Setup checklist and paste-ready prompts, in order | You |
| [`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md) | The design system brief: north star, brand, colour, glass, type, motion, haptics, the centre button, components, iOS vs Android, rules | Claude Design (prompt 1) |
| [`SCREENS.md`](./SCREENS.md) | Every screen in 8 flows: job, primary action, states to draw, direction, motion, haptics, rules to keep, bugs to design out | Claude Design (prompts 2–10) |
| [`SCREENS-ADDITIONS.md`](./SCREENS-ADDITIONS.md) | **Round 2:** Flows 9–16, the screens never designed: notifications and push, crews and group matching, Places live, Blend'n+, regulars, matching v2, system states, sharing and link previews | Claude Design (Round 2 prompts) |
| [`audit/`](./audit/) | What every screen does today, read from the code with `file:line` (2026-10-02, `origin/dev` `54481d2`). The home map and drawer (#363) landed after; SCREENS.md covers it from `docs/PLACEHOLDER_SCREENS.md` §8–§10 | Claude Design, per flow |
| [`research/`](./research/) | The online research behind every number in the brief, with sources. `research/round2/` adds the server gap sweep and the round-2 research | Reference |
| [`assets/`](./assets/) | The monogram as vector (gradient and white), extracted from the brand manual | Upload to Claude Design |

**Where these files disagree, the order of authority is:**
1. `DESIGN-BRIEF.md` + `SCREENS.md`, for how things look and move.
2. The audits, for what a screen does.
3. The research.

The research was written before some decisions were settled, and it says so where it matters.

## Decisions already made (2026-10-02, by the owner)

- **Glass** on the navigation and control layer only. Content stays solid. Brand orbs are the backdrop.
- **Typeface:** Satoshi (the brand manual's), with Geist Mono for numbers and prices (Satoshi has no ₹). **The licence question comes first:** see PROMPTS.md step 1 before uploading the font anywhere.
- **Colour:** the brand gradient returns for the Blend'n mark and the one primary action. Brand orange is `#F05423`; the brand violet is corrected to `#925DA9` (the manual's `#925D46` is a typo).
- **Icons:** outlined only (brand manual).
- **Theme:** dark only.
- **The centre button** fills with the brand gradient when check-in is available, legible as a still frame. Claude Design researches the technique.
- **Splash and launch animation:** deferred until after the redesign.

## Not in this folder, on purpose

- **The brand manual PDF.** Upload it directly to Claude Design.
- **The Satoshi font files.** The ITF licence forbids putting them in a public repo or making them available through a design tool. PROMPTS.md step 1 lists the three options (ask ITF, design with a stand-in, or upload org-internal).

## Round 2 decisions (2026-10-03, by the owner)

- **Group check-in:** nobody checks in for anyone else. Each crew member holds the pass on their own phone, and "We're here" pings the crew. The design makes arriving feel like a group without proxy check-in.
- **Crews live on Me** (a Crews row), **in the Banter** (crew chats, invites, Blend rooms) and **in the Room** (a Crews view). No new tab.
- **The bell opens a full Notifications screen**, not a sheet.
- **Blend'n+ and Regulars** are designed now as labelled **proposal frames** (no server yet).
