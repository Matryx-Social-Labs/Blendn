import { Fragment, type ReactElement, type ReactNode } from 'react'
import { useWindowDimensions } from 'react-native'

/**
 * Text laid out afresh when the phone's text size changes while the app is open (RC drive D2).
 *
 * React Native's new renderer does not re-measure text it has already laid out when Dynamic Type changes: on the
 * change it updates the surface's font multiplier, but `RootShadowNode::clone` dirties layout only when the layout
 * constraints change, not the context (react-native 0.86, `ReactCommon/react/renderer/components/root/RootShadowNode.cpp`).
 * Every mounted `Text` kept the frame it was measured for and drew its glyphs at the new size inside it: the Scene's body
 * as slivers, the Go button's label as a stroke, "Going" in the tab bar as "Go…" while the selected tab (re-rendered)
 * was whole. Only a new shadow node is measured again, so the screen's content is remounted on a change of `fontScale`
 * (a rare event: the person was in Settings), and lays out at the new size.
 *
 * Applied per leaf screen (`rootTextSizeLayout` on the root stack, `textSizeLayout` on each nested navigator) so no navigator is remounted: one that unmounts drops its
 * state, and the person would land on the first tab. What a screen holds in local state starts over; its route and its
 * params stay.
 */
export function TextSizeBoundary({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions()
  return <Fragment key={fontScale}>{children}</Fragment>
}

/**
 * The root stack's routes that are navigators themselves: their screens carry their own boundary, and wrapping the
 * navigator would remount it (and reset it) on a text-size change. `__tests__/axTextSize.test.tsx` checks this
 * against the `_layout.tsx` files under `app/`.
 */
export const NAVIGATOR_ROUTES: readonly string[] = ['(tabs)', 'chat', 'private-chat', 'onboarding', 'preview']

/** A nested navigator's `screenLayout`: each of its screens inside a `TextSizeBoundary`. */
export function textSizeLayout({ children }: { children: ReactElement }): ReactElement {
  return <TextSizeBoundary>{children}</TextSizeBoundary>
}

/** The root stack's: the same, except for the routes that are navigators (`NAVIGATOR_ROUTES`), which wrap their own. */
export function rootTextSizeLayout({ children, route }: { children: ReactElement; route: { name: string } }): ReactElement {
  if (NAVIGATOR_ROUTES.includes(route.name)) return children
  return <TextSizeBoundary>{children}</TextSizeBoundary>
}
