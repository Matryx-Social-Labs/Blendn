# Blendn UX Foundation (Phase 1)

Date: 2026-02-15
Goal: align Blendn interaction design with Family-style principles: Simplicity, Fluidity, Delight.

## Principles

1. Simplicity
- One primary action per step.
- Keep advanced options hidden until intent is clear.
- Prefer inline guidance over interruptive system alerts.

2. Fluidity
- Preserve context using trays/overlays for transient tasks.
- Keep transitions short and directional so state changes feel continuous.
- Maintain object permanence where possible (elements transform instead of disappearing and reappearing elsewhere).

3. Delight
- Apply delight selectively to meaningful moments only:
  - first match
  - event check-in success
  - profile completion
- Avoid high-frequency ornamental animations.

## Shared Tokens and Standards

Implemented in `/Users/hemanth/Developer/Blendn-appandadmin/blendn/lib/theme.ts`:
- `APP_SPACING`
- `APP_RADIUS`
- `APP_SIZE` (includes `touchTarget: 44`)
- `APP_ELEVATION`
- `APP_MOTION`
- `APP_CTA` (primary/secondary/destructive states)

Implemented in `/Users/hemanth/Developer/Blendn-appandadmin/blendn/lib/uxStandards.ts`:
- `BLENDN_UX_PRINCIPLES`
- `INTERACTION_STANDARDS`
- `TRAY_SPECS`
- `TRANSITION_SPECS`
- `HIGH_VALUE_DELIGHT_MOMENTS`

Implemented in `/Users/hemanth/Developer/Blendn-appandadmin/blendn/lib/useInteractionFeedback.ts`:
- `tap`, `success`, `warning`, `error` feedback helpers

## Interaction Policy (to enforce in Phase 2)

1. Confirmations
- Destructive actions require explicit confirmation.
- Destructive confirmations cannot dismiss by tapping backdrop.

2. Validation
- Prefer inline validation text first.
- Reserve blocking alerts for unrecoverable errors only.

3. Touch + Accessibility
- All tappable controls must meet 44x44 minimum target.
- Keep explicit accessibility labels for icon-only actions.

4. Motion
- Use `APP_MOTION` and `TRANSITION_SPECS`; do not hardcode random timings.
- Fast feedback for taps, slightly slower for context changes (tray enter/exit).

## Phase 2 Entry Criteria

- Replace core high-frequency `Alert.alert` interactions in Events/Chat with tray-based components.
- Use `TRAY_SPECS` for all new trays.
- Use `APP_CTA` for primary/secondary/destructive actions in trays.
