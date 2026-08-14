Continue the Figma redesign work on Blendn's mobile app. This is Phase 3 of a multi-session
effort — Phase 1 (design system primitives + chat/profile screens) and Phase 2 (the "Pulse"/Events
screen) are already done. Read these two files first, in full, before doing anything else:

1. `blendn/tasks/todo.md` — the running task log for all phases. Phase 3's section is at the
   bottom and says "not started."
2. `blendn/docs/GRID_SCREEN_TASKS.md` — the Figma-vs-current comparison and task list for this
   phase. It has the full breakdown: what Figma's "The Grid" screen shows, what the current
   Match/Explore screen has instead, a Quick Wins list, a Structural Changes list, and 6 open
   product decisions.

## What this phase is

Figma frame "The Grid" (node `1141:4951`, file `Zi2KcUzhEcLRdqyit22LdQ`) needs to be adapted onto
the app's current Match tab — internally routed as `match`, bottom-nav-labeled "Explore". The real
screen code is `blendn/components/screens/MatchScreen.tsx` (~1541 lines); `app/(tabs)/match.tsx`
is just a thin lazy-load wrapper around it.

Unlike the Pulse screen, this screen has had **zero prior Figma-alignment work**: no
`components/ui/*` primitives (`GlassSurface`, `Pill`, `Avatar`, `GradientButton`, `SectionHeader`
— all built during Phase 1) are used anywhere in it, and it currently has two structurally
different, ad-hoc card types (a horizontal-carousel `SimilarCard` and a 2-column-grid
`StartupItem`) instead of Figma's single unified large-card design shown in one column. This is a
bigger lift than Pulse was — treat the card redesign as the main event, not a styling pass.

## Before writing any code

`docs/GRID_SCREEN_TASKS.md` lists 6 open product decisions that materially change scope (filter-
chip taxonomy, whether to keep existing features not in Figma's mock like the "New joins" pill and
"Live at {event}" row, pagination model, FAB action, and whether "mutual connections" /
LinkedIn-X-social-linking — both shown in Figma, neither built anywhere in the codebase — get
backend-backlogged or just stubbed for this pass). Ask the user about these before implementing,
the same way they were asked and answered for the Pulse screen (see the "Nav remap" and "FAB
action" AskUserQuestion exchange in that phase's history, summarized in `tasks/todo.md`'s Phase 2
section, for the pattern to follow).

## Working pattern established in the last two phases (follow it)

- This is a non-trivial, multi-file, architectural change — use plan mode (`EnterPlanMode`) before
  implementing, per this repo's `CLAUDE.md`.
- Break the plan into micro-tasks tracked via `TaskCreate`/`TaskUpdate`, and mirror them as
  checkboxes in `blendn/tasks/todo.md` as you complete each one — the user explicitly asked for
  this dual-tracking in an earlier phase and expects it to continue.
- Pull exact Figma specs with `mcp__claude_ai_Figma__get_design_context` (node `1141:4951`) before
  writing card/layout code — don't approximate from memory of this prompt; the full pulled markup
  (colors, spacing, corner radii) is more precise than this summary.
- After any JS-only change, do NOT rebuild the native app — Metro is already running and the user
  watches changes hot-reload live in the simulator. Only rebuild via `mcp__XcodeBuildMCP__build_run_sim`
  after a native-level change (there shouldn't be any in this phase). Verify with
  `mcp__XcodeBuildMCP__screenshot` when you want to visually confirm something yourself, but prefer
  letting the user look at their own live-reloading simulator when they're actively watching.
- Run `npx tsc --noEmit -p .` and `npm run lint` after each meaningful edit — the bar to hold is 0
  new errors and 0 new warnings beyond what's already pre-existing in the file (check the baseline
  by running these before you start editing, so you can tell pre-existing noise from regressions).
- Simulator location is currently set to Bangalore (`xcrun simctl location <udid> set
  12.9716,77.5946`) so real event/attendee data loads for testing — no need to redo this unless the
  simulator was reset.
- Reuse existing utilities before writing new ones: `components/ui/*` primitives, `useToast()` from
  `components/Toast.tsx` for any stubbed/undecided action, `components/AppHeader.tsx`'s
  `SegmentedControl` (already built, useful for the Grid/Join-Chat toggle), and check
  `lib/apiClient.ts` for existing endpoints (e.g. `getEventCheckins`, `getActiveCheckins`,
  `getProfile`) before assuming new backend work is needed — several "gaps" in the comparison doc
  turned out to already have real backing data on the Pulse screen (occupation/education fields
  were assumed missing but already existed) — verify before backlogging.
- Whatever ends up genuinely missing on the backend (e.g. mutual-connections query, LinkedIn/X
  OAuth linking) gets written to `blendn-admin/docs/FIGMA_REDESIGN_BACKLOG.md` and mirrored in
  `blendn/docs/FIGMA_REDESIGN_BACKLOG.md` (both already exist from Phase 1/2) — follow the existing
  Priority/Category/File(s)/Evidence/Suggested Fix/Estimated Effort format already used there,
  don't invent a new one.

Start by reading the two files named at the top, then ask the open-decision questions, then plan.
