import * as Location from 'expo-location'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { type BeamWidth, type CompassReading, type Facing, facingFrom, TURN_STEP, worthDrawing } from './heading'
import { Logger } from './logger'

/** At most one redraw of the map per this many ms (8 a second): the compass can report 30. */
const DRAW_INTERVAL_MS = 125
/** A new beam width shows only after it has held this long (picked A, tweak 3): an unsure moment does not flicker. */
const WIDTH_HOLD_MS = 2000

type Fix = { speed?: number | null; course?: number | null; timestamp?: number | null } | null

/** The app is in front. The compass is never read from the background. */
function useForeground() {
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'))
    return () => sub.remove()
  }, [])
  return active
}

/**
 * Which way you face, for the you-mark's beam (lib/heading.ts). The compass is watched only while `on` (the map is on
 * screen with a precise fix) and the app is in front, and is let go the moment either ends: it is a sensor left running
 * otherwise. A reading becomes a redraw only for a real turn (`worthDrawing`), at most 8 times a second.
 */
export function useHeading({ on, fix, reduceMotion }: { on: boolean; fix: Fix; reduceMotion: boolean }): Facing | null {
  const watching = useForeground() && on
  const [compass, setCompass] = useState<CompassReading | null>(null)

  useEffect(() => {
    if (!watching) return
    let sub: { remove: () => void } | null = null
    let stopped = false
    let latest: CompassReading | null = null
    let lastAt = 0
    let trailing: ReturnType<typeof setTimeout> | null = null
    const draw = () => {
      trailing = null
      lastAt = Date.now()
      setCompass(latest)
    }
    Location.watchHeadingAsync((reading) => {
      latest = { trueHeading: reading.trueHeading, magHeading: reading.magHeading, accuracy: reading.accuracy, at: Date.now() }
      const wait = DRAW_INTERVAL_MS - (Date.now() - lastAt)
      if (wait <= 0) draw()
      else trailing ??= setTimeout(draw, wait)
    })
      .then((s) => (stopped ? s.remove() : (sub = s)))
      // No compass (the iOS simulator, an Android phone without a magnetometer): no beam, and nothing to tell anyone.
      .catch((error) => Logger.info('events', 'No compass for the heading beam', { error: String(error) }))
    return () => {
      stopped = true
      sub?.remove()
      if (trailing) clearTimeout(trailing)
      // The next watch starts from nothing, never from where the phone pointed last time.
      setCompass(null)
    }
  }, [watching])

  // What is drawn changes only for a real turn, a new width, or the beam coming or going (kept from render to render).
  const [facing, setFacing] = useState<Facing | null>(null)
  const next = watching ? facingFrom(compass, fix) : null
  if (worthDrawing(facing, next, reduceMotion ? TURN_STEP.reduceMotion : TURN_STEP.normal)) setFacing(next)

  // The width shown: the first at once, a change only once it has held. Gone, the last stays, so the beam fades out as it was.
  const [width, setWidth] = useState<BeamWidth | null>(null)
  const wanted = facing?.width ?? null
  useEffect(() => {
    if (wanted === null || wanted === width) return
    const hold = setTimeout(() => setWidth(wanted), width === null ? 0 : WIDTH_HOLD_MS)
    return () => clearTimeout(hold)
  }, [wanted, width])

  return facing ? { deg: facing.deg, width: width ?? facing.width } : null
}
