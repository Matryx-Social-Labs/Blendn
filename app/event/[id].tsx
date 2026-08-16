import { ScreenProfiler } from '../../lib/perf'
// Direct import instead of lazy loading for faster navigation
import EventDetailScreen from '../../components/screens/EventDetailScreen'

function EventDetailInner() {
  return <EventDetailScreen />
}


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function EventDetail() {
  return (
    <ScreenProfiler id="scene">
      <EventDetailInner />
    </ScreenProfiler>
  )
}
