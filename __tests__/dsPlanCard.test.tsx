/*
 * <PlanCard>, <NightPassRow> and <PlanList> (guidelines/components/PlanCard.html,
 * Flow 12, ROUND3 G2): a plan is a radio row, not a card with a badge. A 22 pt
 * ring, the name, the store's price in Geist Mono, one sub line. Night Pass
 * is 24 hours and doesn't renew; never "until 6 am". H.select on a pick.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'

import { NightPassRow, PlanCard, PlanList } from '../components/ds/PlanCard'
import { COLOR, MATERIAL } from '../lib/design/tokens'
import { H } from '../lib/haptics'

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)

let select: jest.SpyInstance
beforeEach(() => {
  select = jest.spyOn(H, 'select').mockImplementation(() => {})
})

describe('<PlanCard>', () => {
  it('is a radio: name, spoken price and sub line, checked when picked', async () => {
    await render(<PlanCard name="3 months" price="₹499" per="/ 3 months" sub="About ₹166 a month · Save 16%" selected onPress={jest.fn()} testID="p" />)
    const radio = screen.getByRole('radio', { name: '3 months, 499 rupees every 3 months, About ₹166 a month · Save 16%' })
    expect(radio.props.accessibilityState).toMatchObject({ checked: true })
  })

  it('the ring: 22 pt, the hue’s 6 pt ring when picked, a faint 1.5 pt one when not', async () => {
    await render(<PlanCard name="Monthly" price="₹199" per="/ month" selected onPress={jest.fn()} testID="p" />)
    expect(flat('p-ring')).toMatchObject({ width: 22, height: 22, borderWidth: 6, borderColor: COLOR.brandOrange })
    await render(<PlanCard name="Monthly" price="₹199" per="/ month" onPress={jest.fn()} testID="p" />)
    expect(flat('p-ring').borderWidth).toBe(1.5)
  })

  it('H.select on a pick, nothing on a re-tap', async () => {
    const onPress = jest.fn()
    await render(<PlanCard name="Monthly" price="₹199" per="/ month" onPress={onPress} testID="p" />)
    await fireEvent.press(screen.getByTestId('p'))
    expect(select).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledTimes(1)
    await render(<PlanCard name="Monthly" price="₹199" per="/ month" selected onPress={onPress} testID="p" />)
    await fireEvent.press(screen.getByTestId('p'))
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('no “most popular”, no strike-through: just the row', async () => {
    await render(<PlanCard name="Yearly" price="₹1,499" per="/ year" sub="About ₹125 a month · Save 37%" onPress={jest.fn()} testID="p" />)
    expect(screen.queryByText(/popular/i)).toBeNull()
  })
})

describe('<NightPassRow>', () => {
  // D3: one product, one name. Negative control: the row named "Just tonight" fails this.
  it('Night Pass · 24 hours · doesn’t renew; never “Just tonight”, never “until 6 am”', async () => {
    await render(<NightPassRow price="₹49" onPress={jest.fn()} testID="n" />)
    expect(screen.getByText('Night Pass')).toBeTruthy()
    expect(screen.queryByText('Just tonight')).toBeNull()
    expect(screen.getByText('24 hours · doesn’t renew')).toBeTruthy()
    expect(screen.queryByText(/6 am/)).toBeNull()
  })
})

describe('<PlanList>', () => {
  it('apartFrom: the rule before that row is the 22% white one, inset 8 pt, not the row hairline', async () => {
    await render(
      <PlanList testID="l" apartFrom={2}>
        <PlanCard name="Monthly" price="₹199" per="/ month" onPress={jest.fn()} />
        <PlanCard name="Yearly" price="₹1,499" per="/ year" onPress={jest.fn()} />
        <NightPassRow price="₹49" onPress={jest.fn()} />
      </PlanList>
    )
    expect(screen.getAllByTestId('l-hairline', { includeHiddenElements: true })).toHaveLength(1)
    expect(flat('l-apart')).toMatchObject({ marginHorizontal: 8 })
  })

  it('a surface list with hairlines between rows; 8% white on a glass sheet, sunken on a solid one', async () => {
    await render(
      <PlanList testID="l">
        <PlanCard name="Monthly" price="₹199" per="/ month" onPress={jest.fn()} />
        <NightPassRow price="₹49" onPress={jest.fn()} />
      </PlanList>
    )
    expect(flat('l')).toMatchObject({ backgroundColor: COLOR.surface })
    expect(screen.getAllByTestId('l-hairline', { includeHiddenElements: true })).toHaveLength(1)
    await render(
      <PlanList onSheet testID="l">
        <NightPassRow price="₹49" onPress={jest.fn()} />
      </PlanList>
    )
    expect(flat('l').backgroundColor).toBe(MATERIAL.fillOnGlass)
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    await render(
      <PlanList onSheet testID="l">
        <NightPassRow price="₹49" onPress={jest.fn()} />
      </PlanList>
    )
    expect(flat('l').backgroundColor).toBe(COLOR.surfaceSunken)
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })
})
