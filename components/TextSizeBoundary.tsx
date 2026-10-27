import { Fragment, type ReactElement, type ReactNode } from 'react'
import { Platform, useWindowDimensions } from 'react-native'

import { ErrorBoundary } from './ErrorBoundary'

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
 *
 * iOS only. Android relaunches the Activity on a font-size change (`fontScale` is not in the manifest's `configChanges`),
 * so the app's new root lays every text out afresh anyway; remounting the old tree's screens as it is torn down only ran
 * their mount effects again, navigations among them, at the moment the relaunch was least able to take one (RC drive 2
 * D-1). Should `fontScale` ever join `configChanges`, Android needs this too.
 */
export function TextSizeBoundary({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions()
  return <Fragment key={Platform.OS === 'android' ? 'relaunched' : fontScale}>{children}</Fragment>
}

/**
 * The root stack's routes that are navigators themselves: their screens carry their own boundary, and wrapping the
 * navigator would remount it (and reset it) on a text-size change. `__tests__/axTextSize.test.tsx` checks this
 * against the `_layout.tsx` files under `app/`.
 */
export const NAVIGATOR_ROUTES: readonly string[] = ['(tabs)', 'chat', 'private-chat', 'onboarding', 'preview']

type ScreenLayoutProps = {
  children: ReactElement
  route: { name: string }
  navigation: { canGoBack: () => boolean; goBack: () => void }
}

/**
 * A nested navigator's `screenLayout`: each of its screens inside a `TextSizeBoundary`, and inside its own `ErrorBoundary`
 * (RC drive 5). One screen that throws shows the crash screen where it was, with Go back where there is somewhere to go:
 * the navigator stays up, and the back gesture, the tabs and the next link all still work. With only the root's boundary,
 * one bad screen took the navigator down with it and the app was stuck until it was relaunched.
 */
export function textSizeLayout({ children, route, navigation }: ScreenLayoutProps): ReactElement {
  return (
    <ErrorBoundary route={route.name} onLeave={navigation.canGoBack() ? () => navigation.goBack() : undefined}>
      <TextSizeBoundary>{children}</TextSizeBoundary>
    </ErrorBoundary>
  )
}

/** The root stack's: the same, except for the routes that are navigators (`NAVIGATOR_ROUTES`), which wrap their own. */
export function rootTextSizeLayout(props: ScreenLayoutProps): ReactElement {
  if (NAVIGATOR_ROUTES.includes(props.route.name)) return props.children
  return textSizeLayout(props)
}
