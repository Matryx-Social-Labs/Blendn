/*
 * A profile opened from the Room's grid is titled as the room shows the person.
 *
 * The profile fails closed: until the server says `identityVisible`, the title
 * is the `pseudonym` param, or "Someone" without it. Room info already passes
 * it; the grid did not, so every card opened from the grid read "Someone".
 */
import * as fs from 'fs'
import * as path from 'path'

const screen = fs.readFileSync(path.join(__dirname, '../components/blendn/BlendnScreen.tsx'), 'utf8')
const openProfile = screen.slice(screen.indexOf('const openProfile'), screen.indexOf('const sayHi'))

it('passes the room pseudonym and a per-room seed with the handle', () => {
  expect(openProfile).toContain("pathname: '/user/[id]'")
  expect(openProfile).toContain('pseudonym: p.name')
  expect(openProfile).toContain('roomSeed: `${eventId}:${p.id}`')
})
