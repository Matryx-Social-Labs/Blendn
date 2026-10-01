import { readFileSync } from 'fs'
import { join } from 'path'

import { normaliseIntents, toggleIntent } from '../lib/intents'

/**
 * "Just here" is exclusive, on every screen that offers it (SCRUM-518).
 *
 * The server refuses `just_here` alongside anything (admin
 * `lib/validations/profile.ts`). The event-preferences screen knew; Edit
 * profile toggled each chip on its own, so it could hold all three, and Save
 * came back 400 with "Couldn't save your profile. Try again." — which no retry
 * could ever fix.
 */
describe('toggleIntent', () => {
  it('turns an ordinary intent on and off', () => {
    expect(toggleIntent([], 'networking')).toEqual(['networking'])
    expect(toggleIntent(['networking', 'friendship'], 'networking')).toEqual(['friendship'])
  })

  it('"Just here" clears every other intent', () => {
    expect(toggleIntent(['networking', 'friendship'], 'just_here')).toEqual(['just_here'])
  })

  it('any other intent clears "Just here"', () => {
    expect(toggleIntent(['just_here'], 'networking')).toEqual(['networking'])
    expect(toggleIntent(toggleIntent(['just_here'], 'networking'), 'friendship')).toEqual(['networking', 'friendship'])
  })

  it('tapping "Just here" again leaves nothing selected', () => {
    expect(toggleIntent(['just_here'], 'just_here')).toEqual([])
  })
})

describe('a stored row that already mixes them', () => {
  // 16 of 280 staging profiles hold one, from before the server refused it.
  it('opens as "Just here" alone: the opt-out wins over a contradiction', () => {
    expect(normaliseIntents(['friendship', 'just_here'])).toEqual(['just_here'])
    expect(normaliseIntents(['dating', 'just_here', 'networking', 'friendship'])).toEqual(['just_here'])
  })

  it('leaves a coherent answer as it is', () => {
    expect(normaliseIntents(['networking', 'friendship'])).toEqual(['networking', 'friendship'])
    expect(normaliseIntents(['just_here'])).toEqual(['just_here'])
    expect(normaliseIntents([])).toEqual([])
  })

  it('never mutates what it was given', () => {
    const held = Object.freeze(['networking', 'just_here'] as const)
    expect(toggleIntent(held, 'friendship')).toEqual(['networking', 'friendship'])
    expect(normaliseIntents(held)).toEqual(['just_here'])
  })
})

describe('both screens use it', () => {
  const read = (p: string) =>
    readFileSync(join(__dirname, '..', p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it.each(['app/edit-profile.tsx', 'app/event-preferences/[eventId].tsx'])('%s', (file) => {
    expect(read(file)).toMatch(/\(prev\) => toggleIntent\(prev, value\)/)
  })

  it('Edit profile opens a stored mix normalised, and measures changes against that', () => {
    // So a name-only save does not resend an invalid set — the 400 with no way out.
    const src = read('app/edit-profile.tsx')
    expect(src).toMatch(/const loadedIntents = normaliseIntents\(/)
    expect(src).toMatch(/setIntents\(loadedIntents\)/)
    expect(src).toMatch(/intents: loadedIntents,/)
  })
})
