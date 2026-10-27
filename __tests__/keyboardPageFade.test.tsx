/**
 * rc9 D3: at AX the sign-up form cannot fit above its dock, and the age hint's last line sat cut in half at the scroll's
 * foot ("ioin.") until the page was scrolled. A cut line reads as a defect unless the page says it goes on: the foot
 * fades into the page while there is more under it, and is clean at the end.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-linear-gradient', () => {
  const { View: V } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <V {...props} /> }
})

/* eslint-disable import/first */
import { KeyboardPage, moreBelow } from '../components/onboarding/KeyboardPage'
/* eslint-enable import/first */

const SCROLL = 600
const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } })
const scrolled = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } })
const fade = () => screen.queryByTestId('keyboard-page-fade')

async function page(scrollProps = {}) {
  await render(
    <KeyboardPage dock={<Text>Create account</Text>} scrollProps={{ testID: 'scroll', ...scrollProps }}>
      <Text>form</Text>
    </KeyboardPage>,
  )
  const scroll = screen.getByTestId('scroll')
  await act(async () => fireEvent(scroll, 'layout', layout(SCROLL)))
  return scroll
}

describe('moreBelow', () => {
  it('is true only while the content runs past the foot', () => {
    expect(moreBelow(680, SCROLL, 0)).toBe(true)
    expect(moreBelow(680, SCROLL, 80)).toBe(false)
    expect(moreBelow(500, SCROLL, 0)).toBe(false)
    expect(moreBelow(680, 0, 0)).toBe(false)
  })
})

// Negative control: render the fade never (`{false ? …`) and the first test below fails.
describe('KeyboardPage foot', () => {
  it('fades at rest when the form overflows, and is clean once scrolled to the end', async () => {
    const scroll = await page()
    await act(async () => fireEvent(scroll, 'contentSizeChange', 390, 680))
    expect(fade()).toBeTruthy()
    await act(async () => fireEvent.scroll(scroll, scrolled(80)))
    expect(fade()).toBeNull()
    await act(async () => fireEvent.scroll(scroll, scrolled(10)))
    expect(fade()).toBeTruthy()
  })

  it('has no fade when the form fits', async () => {
    const scroll = await page()
    await act(async () => fireEvent(scroll, 'contentSizeChange', 390, 500))
    expect(fade()).toBeNull()
  })

  it('still hands the screen its own scroll handlers', async () => {
    const onScroll = jest.fn()
    const onContentSizeChange = jest.fn()
    const scroll = await page({ onScroll, onContentSizeChange })
    await act(async () => fireEvent(scroll, 'contentSizeChange', 390, 680))
    await act(async () => fireEvent.scroll(scroll, scrolled(5)))
    expect(onContentSizeChange).toHaveBeenCalledWith(390, 680)
    expect(onScroll).toHaveBeenCalled()
  })
})
