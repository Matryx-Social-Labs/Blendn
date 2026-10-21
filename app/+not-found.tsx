import { router, usePathname } from 'expo-router'

import { DiscMark } from '../components/ds/DiscMark'
import { SystemScreen } from '../components/system/SystemScreen'

/** The mark's height on this screen (Flow 15 `notFound`: the gradient disc mark, 96). */
const MARK_HEIGHT = 96

/**
 * A link that goes nowhere (Flow 15 15.12 01, A1): a branded page in place of "Unmatched Route". It says the link may be
 * old or missing a part, shows what was asked for in Geist Mono when there was a path, and offers the one way on. No
 * retry (there is nothing to retry), and no red: nothing is wrong with the person.
 */
export default function NotFoundScreen() {
  const pathname = usePathname()
  const asked = pathname && pathname !== '/' ? `blendn.app${pathname}` : undefined
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
