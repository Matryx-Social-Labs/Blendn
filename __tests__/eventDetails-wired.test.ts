import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The details the server sends must survive the fetch mapping.
 *
 * This is the failure mode nothing else here can see. `noOrphanComponents`
 * proves `SceneDetails` is rendered somewhere; the transform's own tests prove
 * it shapes a payload correctly. Neither notices if `EventDetailScreen` stops
 * *copying* `details` off the response — the component still renders, the
 * transform still works, and the section silently disappears because it is
 * handed `undefined`.
 *
 * That is not hypothetical: it is exactly what happened to `amenities`. The
 * server shipped them on this payload, the tile component existed and was
 * styled to the frame, and the client dropped the field at the schema boundary
 * (K5/L3.6). The screen looked fine and the data never arrived.
 *
 * There are two fetch paths — the cold load and the cache-backed refresh — and
 * a field mapped in one and not the other is worse than one missing from both,
 * because the section then appears and disappears depending on how you got to
 * the screen. So both go through one mapper, `applyDetail`, and this pins that
 * the mapper carries the fields and that both paths call it.
 *
 * Literal substring matching, not a regex: a guard that scans inside an object
 * literal with a negated character class stops at the first nested delimiter,
 * which has produced four vacuous guards on this project already.
 */
const SOURCE = readFileSync(
  join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'),
  'utf8'
)

describe('the event screen keeps the details it is sent', () => {
  it('copies details off the response on both fetch paths', () => {
    const mapper = SOURCE.slice(SOURCE.indexOf('const applyDetail = '), SOURCE.indexOf('const applyEventDetails = '))
    expect(mapper).toContain('details: (d.details')
    expect(mapper).toContain('amenities: Array.isArray(d.amenities)')
    // One mapping, so a third copy that drifts fails here.
    expect(SOURCE.split('details: (d.details').length - 1).toBe(1)
    expect(SOURCE.split('amenities: Array.isArray(d.amenities)').length - 1).toBe(1)

    // The cold load...
    const fetchPath = SOURCE.slice(SOURCE.indexOf('const applyEventDetails = '), SOURCE.indexOf('const fetchEventDetails = '))
    expect(fetchPath).toContain('applyDetail(d)')
    // ...and the cache, read during render on a new id.
    const cachePath = SOURCE.slice(SOURCE.indexOf('const cached = getEventDetailCache'), SOURCE.indexOf("Logger.journey('events', 'detail:mount'"))
    expect(cachePath).toContain('applyDetail(cached)')
  })

  it('runs the payload through the transform rather than reading it raw', () => {
    /*
     * The columns are JSON and arrive as `unknown`. A screen that destructures
     * them directly breaks on a row written before the dashboard settled on a
     * shape — and this screen carries the check-in button.
     */
    expect(SOURCE).toContain('eventDetailBlocks(event?.details)')
    expect(SOURCE).toContain('<SceneDetails blocks={detailBlocks} />')
  })
})
