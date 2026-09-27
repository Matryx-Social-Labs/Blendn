# Lessons

## Motion

- **Don't use Reanimated layout transitions (`LinearTransition`, `layout=`) on a view that contains a `BlurView` or an iOS shadow.** Each frame of a size change becomes a layout pass, a blur redraw and a shadow redraw. On Reanimated 3 with the New Architecture this stutters on a real phone (SceneCTA, 2026-09-27). Snap the size and hide the snap with an `entering` on the content that changes, or animate a transform instead.
- **When a skill assumes a newer library than the repo has, raise the mismatch before building. Don't quietly fall back to the old API.** `/animate-expo` is written for Reanimated 4. On 3.17 I started building with `runOnJS` and physics springs, and the user stopped me to upgrade first (2026-09-28). Check the versions against the skill's baseline at the start and propose the upgrade then.
- **A native dependency upgrade isn't verified until the rebuilt binary runs.** Until the new build installs, the old binary runs the new JS and aborts with `SIGABRT` and no crash report. Wait for the build to finish, then relaunch, before diagnosing a crash.
- **If there's no simulator, say so before calling motion done.** A layout animation that only type-checks hasn't been verified. Ask the user to feel-check it before committing.

- **When motion is split across two nested views, everything visible goes on the view that moves.** For the sheet drag, I put the drag on an inner layer and left the fill, corners and padding on the outer one. Dragging then slid the content down through a background that stayed put (2026-09-28). Split the style instead: placement and height caps go on the wrapper, and the look goes on the moving layer.

## Visual design

- **No glows, blooms or glass stacks.** The user rejected the frosted-glass CTA with an orange bloom, and the pulsing halo on the room button, as "very AI generated". Use a flat, high-contrast fill with no shadow; show status with a still mark (dot or label), not motion. Research real apps (Refero) before restyling, instead of inventing effects.

- **When moving an element off the accent, check what it sits on.** Neutralising colours made four things vanish: the Liked button went `surfaceSunken` inside a `surfaceSunken` tray, off switch tracks went `surface` on a `surfaceSunken` card, the Room's selected segment was `surface` on `surfaceSunken`, and a 4pt ring used `separator` (a 10% hairline colour). Pick the neutral by the parent's fill: one step away from it, or `textPrimary`/`textTertiary` for marks.

- **A design rule written into a test is a past decision, not a user requirement.** The Me tab's "control panel, not a second profile" rule (Preview opening `app/user/[id]`) was guarded by tests, so I built the redesign around it. The user wanted no Preview at all and one merged profile page (2026-09-28). When a redesign is asked to feel more alive, flag the structural rules the tests lock in, and ask whether they still hold, instead of designing inside them.

## Verification

- **Parallel agents in one working tree must never `git stash`, `checkout` or `reset`.** On 2026-09-28 an agent stashed to check whether a lint warning was already there, which briefly hid three other agents' in-progress edits. Put the rule in every parallel-agent prompt, and compare against `git show HEAD:<file>` instead.

- **Re-run the full suite after the *last* edit, not before it.** A one-line lint cleanup (dropping an unused `EMBER_TYPE` import) after the final `jest` run broke a source-grepping test and failed CI on PR #285. Many tests here grep source files, so "only an import" is never safe to skip.
- **A token check that passes isn't a design audit.** `lint:design` was clean while ~225 departures from docs/DESIGN_SYSTEM.md shipped, because it only checked what it was written to check. When asked "does every screen follow the system", read the doc's rules and check each one, then extend the checker for anything mechanical.
