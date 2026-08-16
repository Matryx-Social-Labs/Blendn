import { Stack } from 'expo-router'

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
 * Not gated behind `__DEV__`: they render fixtures and reach no network, and a
 * route that only exists in development is one nobody can check a release
 * build against.
 */
export default function PreviewLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
}
