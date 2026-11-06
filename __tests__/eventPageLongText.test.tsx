/**
 * Flow 4 E-B, worst case (owner 2026-11-05, memory long-text-proof-every-ui; board phones eB-worst, eB-ax): the shared
 * fixture's strings in the guide rows and the dock. Every variable line keeps its own slot: the venue wraps to two lines,
 * the area and the host ellipsize after one, the count is exact ("12,480 going"), and no row lets a long string run
 * under the action beside it.
 */
import { render, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'

import { DockRow } from '../components/ds/DockRow'
import { EventGuide } from '../components/scene/EventGuide'
import { whoLine } from '../lib/eventFacts'
import { rowThatOverflows, slotOf, WORST } from './helpers/longText'

const window = Dimensions.get('window')
const atScale = (fontScale: number) => Dimensions.set({ window: { ...window, width: 393, fontScale }, screen: { ...window, width: 393, fontScale } })
afterEach(() => Dimensions.set({ window, screen: window }))
const hidden = { includeHiddenElements: true }

const guide = () => (
  <EventGuide
    when={{ day: 'Fri 21 – Sun 23 Nov', time: '6 PM', until: 'Day 1 of 3 · Till 2 AM', add: { label: 'Add to calendar', icon: 'calendar-plus', onPress: jest.fn() } }}
    where={{ venue: WORST.venue, area: WORST.city, distance: '12 km', directions: { label: 'Directions', icon: 'navigation', onPress: jest.fn() } }}
    who={{ ...whoLine({ count: WORST.count, word: 'going', minAge: 18 }), host: 'Kerala Design Week & Friends of the Riso Collective' }}
  />
)

describe('the guide rows at the default size', () => {
  beforeEach(() => atScale(1))

  it('the venue wraps to two lines; the area and the host ellipsize after one', async () => {
    await render(guide())
    expect(slotOf(screen.getByText(WORST.venue, hidden) as never)).toEqual({ lines: 2, ellipsize: 'tail' })
    expect(slotOf(screen.getByText(new RegExp(WORST.city), hidden) as never)).toEqual({ lines: 1, ellipsize: 'tail' })
    expect(slotOf(screen.getByText(/^By Kerala Design Week/, hidden) as never)).toEqual({ lines: 1, ellipsize: 'tail' })
  })

  it('the count is exact and grouped on a page row, never compact', async () => {
    await render(guide())
    expect(screen.getByTestId('scene-guide-who').props.accessibilityLabel).toBe('12,480 going · 18+. By Kerala Design Week & Friends of the Riso Collective')
    expect(screen.queryByText(/12k/, hidden)).toBeNull()
  })

  it('no long line runs under its row’s action circle', async () => {
    await render(guide())
    for (const text of [WORST.venue, new RegExp(WORST.city), /^By Kerala/]) {
      expect(rowThatOverflows(screen.getByText(text, hidden) as never)).toBeNull()
    }
  })
})

describe('the guide rows at the largest text', () => {
  beforeEach(() => atScale(3.1))

  it('every line wraps (no clamp), and the glyph and the circle leave so the words have the row', async () => {
    await render(guide())
    expect(slotOf(screen.getByText(WORST.venue, hidden) as never).lines).toBeUndefined()
    expect(slotOf(screen.getByText(/^By Kerala/, hidden) as never).lines).toBeUndefined()
    expect(screen.queryByLabelText('Directions')).toBeNull()
  })
})

describe('the dock line', () => {
  const dock = () => (
    <DockRow testID="d" state="You’re going" sub="Day 3 starts Tue 29 Sep, 9 PM" onPressState={jest.fn()} action={{ label: 'Open the room', kind: 'primary', icon: 'door-open', onPress: jest.fn() }} />
  )

  it('at the default size the state and its line ellipsize in their own slot beside the action', async () => {
    atScale(1)
    await render(dock())
    expect(slotOf(screen.getByTestId('d-state') as never).lines).toBe(1)
    expect(slotOf(screen.getByTestId('d-sub') as never).lines).toBe(1)
    expect(rowThatOverflows(screen.getByTestId('d-sub') as never)).toBeNull()
  })

  it('at the largest text it restacks: the state, then a full-width button', async () => {
    atScale(3.1)
    await render(dock())
    expect(screen.getByTestId('d').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]))
    expect(slotOf(screen.getByTestId('d-sub') as never).lines).toBeUndefined()
  })
})
