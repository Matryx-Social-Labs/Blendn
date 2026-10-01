import { readFileSync } from 'fs'
import { join } from 'path'

import { toggleIntent } from '../lib/intents'

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

describe('both screens use it', () => {
  const read = (p: string) =>
    readFileSync(join(__dirname, '..', p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it.each(['app/edit-profile.tsx', 'app/event-preferences/[eventId].tsx'])('%s', (file) => {
    expect(read(file)).toMatch(/\(prev\) => toggleIntent\(prev, value\)/)
  })
})
