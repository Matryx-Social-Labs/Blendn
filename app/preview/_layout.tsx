import { Redirect, Stack } from 'expo-router'

import { textSizeLayout } from '../../components/TextSizeBoundary'

/**
 * The fixture harnesses, as plain routes.
 *
 * These lived in `app/(tabs)/` as undeclared extras inside the `Tabs`
 * navigator. Deep-linking to one while the tabs were already mounted stopped
 * working partway through a session — `/room` and every other top-level route
 * kept working on the same signed-in session, so it was the group, not auth and
 * not the dev client.
 *
 * A harness that cannot be opened is a harness that stops being used, and these
 * are the only way to look at a screen without a login, a socket and a room
 * with people in it. So they are their own stack, reached at
 * `exp+blendn:///preview/<name>`.
 *
 * Dev builds only (docs/redesign/ROUND3.md, D2): a release build sent here
 * lands on `/`. This used to stay open in release so a build could be checked
 * against the fixtures; the ruling is that nothing ships a fixture screen.
 */
export default function PreviewLayout() {
  if (!__DEV__) return <Redirect href="/" />
  return <Stack screenLayout={textSizeLayout} screenOptions={{ headerShown: false, animation: 'fade' }} />
}
