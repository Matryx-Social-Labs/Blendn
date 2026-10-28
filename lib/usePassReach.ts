import { useEffect, useState } from 'react'

import { passReach, type PassReach } from './attendanceState'
import { getDistanceMetres } from './geo'
import { quietLocation, type TonightEvent, type TonightLocation } from './useTonight'

/** How often a docked pass that is not open looks at the fix again: walking to the door re-enables it. */
const REREAD_MS = 30_000

/**
 * Whether the docked pass's hold is offered (`passReach`, owner ruling 2026-10-28): inside the fence, or not plainly away,
 * it is; a fresh precise fix more than `TOO_FAR_M` from the event, or location off, disables it with one short line.
 * Measured from the phone's own fix when there is one and the event's coordinates, else the server's distance. Never prompts.
 */
export function usePassReach(door: TonightEvent | null, insideEventId: string | null, location: TonightLocation): PassReach {
  // Keyed by the door it was measured for: another door starts unknown, without a reset in the effect.
  const [measured, setMeasured] = useState<{ id: string; m: number | null } | null>(null)
  const id = door?.id ?? null
  const lat = door?.latitude ?? null
  const lon = door?.longitude ?? null
  const km = door?.distanceKm ?? null
  const inside = id !== null && id === insideEventId

  useEffect(() => {
    if (id === null || inside) return
    let live = true
    // Through a promise, so a read that throws is an unknown distance (the hold stays open), never a crash.
    const read = () =>
      Promise.resolve()
        .then(quietLocation)
        .then(({ coords }) => {
          if (!live) return
          // 0,0 is an unset coordinate in this schema.
          const placed = typeof lat === 'number' && typeof lon === 'number' && !(lat === 0 && lon === 0)
          setMeasured({
            id,
            m: coords && !coords.approximate && placed ? getDistanceMetres(coords.latitude, coords.longitude, lat, lon) : typeof km === 'number' && Number.isFinite(km) ? km * 1000 : null,
          })
        })
        .catch(() => {})
    void read()
    const timer = setInterval(read, REREAD_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [id, inside, lat, lon, km])

  const distanceM = measured && measured.id === id ? measured.m : null
  return id === null ? 'open' : passReach({ inside, location, distanceM })
}
