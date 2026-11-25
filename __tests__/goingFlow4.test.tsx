/**
 * Flow 4 G-A (owner's pick 2026-11-05): in Going every row leads with its date stamp, never a cover, so one row shape
 * serves every event and a missing cover can never show; Next up keeps its cover with the Pulse lead's underglow.
 */
import { render, screen } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

import { EventCard } from '../components/ds/EventCard'

const GOING = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')

it('a row with a stamp draws the date, not the cover (control: without one it draws the cover)', async () => {
  await render(<EventCard kind="row" title="Indie Unplugged" time="8 PM" venue="The Humming Tree" cover="https://x.test/c.jpg" stamp={{ iso: '2026-11-14T14:30:00Z', timeZone: 'Asia/Kolkata' }} testID="r" />)
  expect(screen.getByLabelText('Saturday 14 November')).toBeTruthy()
  await render(<EventCard kind="row" title="Indie Unplugged" time="8 PM" venue="The Humming Tree" cover="https://x.test/c.jpg" testID="r" />)
  expect(screen.queryByLabelText('Saturday 14 November')).toBeNull()
})

it('a past night’s stamp dims its day', async () => {
  await render(<EventCard kind="row" title="Brewery Run 5K" time="7 AM" venue="Toit" stamp={{ iso: '2026-10-26T01:30:00Z', timeZone: 'Asia/Kolkata', past: true }} testID="r" />)
  expect(screen.getByLabelText('Monday 26 October')).toBeTruthy()
})

it('Going passes the stamp for the going, past and saved rows; a visit to a place keeps its type art', () => {
  expect(GOING.match(/stamp=\{\{ iso: /g)?.length).toBe(3)
  expect(GOING).toMatch(/plate=\{visit\.venueType \?\? 'bar'\}/)
})

it('Next up carries the Pulse lead’s underglow (MATERIAL.glowLead)', () => {
  expect(GOING).toMatch(/MATERIAL\.glowLead/)
})
