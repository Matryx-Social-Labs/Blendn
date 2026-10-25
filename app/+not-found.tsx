import { router, usePathname } from 'expo-router'

import { DiscMark } from '../components/ds/DiscMark'
import { SystemScreen } from '../components/system/SystemScreen'

/**
 * The path is echoed only when it has the shape of one of our own links (a known first segment and id-like parts), so a
 * crafted link cannot print a sentence of its choosing on a branded screen.
 */
const ECHOABLE_ROOTS = new Set(['e', 'v', 'f', 'event', 'venue', 'crews', 'user', 'friends', 'offer', 'board', 'chat', 'private-chat', 'rate'])
export function echoable(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === '/' || pathname.length > 64) return false
  const [root, ...rest] = pathname.split('/').filter(Boolean)
  return ECHOABLE_ROOTS.has(root ?? '') && rest.length <= 2 && rest.every((part) => /^[A-Za-z0-9_-]{1,40}$/.test(part))
}

/** The mark's height on this screen (Flow 15 `notFound`: the gradient disc mark, 96). */
const MARK_HEIGHT = 96

/**
 * A link that goes nowhere (Flow 15 15.12 01, A1): a branded page in place of "Unmatched Route". It says the link may be
 * old or missing a part, shows what was asked for in Geist Mono when there was a path, and offers the one way on. No
 * retry (there is nothing to retry), and no red: nothing is wrong with the person.
 */
export default function NotFoundScreen() {
  const pathname = usePathname()
  const asked = echoable(pathname) ? `blendn.app${pathname}` : undefined
  return (
    <SystemScreen
      icon="unlink"
      lead={<DiscMark height={MARK_HEIGHT} fill="gradient" />}
      title="Nothing here"
      body="That link doesn’t go anywhere in Blend’n. It may be old, or missing a part."
      note={asked}
      noteMono
      actions={[
        {
          label: 'Go to the Pulse',
          kind: 'strong',
          // Flow 15: "Go to the Pulse · strong-neutral · none".
          pressHaptic: false,
          onPress: () => router.replace('/(tabs)/events'),
        },
      ]}
      testID="not-found"
    />
  )
}
