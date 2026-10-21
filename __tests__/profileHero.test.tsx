/**
 * The hero and the bar, drawn (Flow 6 `user` / `friend`): the three faces a hero has, the pager's pips, the bar's glass and title at
 * rest and scrolled, and the paged viewer's Close and counter. Layout, not shape: what is on screen, and where.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { makeMutable } from 'react-native-reanimated'

const INSET_TOP = 59
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: INSET_TOP, bottom: 34, left: 0, right: 0 }) }))
jest.mock('../components/ds/Orbs', () => ({ Orbs: () => null }))
jest.mock('../components/motion/ZoomableImage', () => ({ ZoomableImage: () => null }))

/* eslint-disable import/first */
import { PhotoViewer } from '../components/profile/PhotoViewer'
import { ProfileBar } from '../components/profile/ProfileBar'
import { ProfileHeroStage } from '../components/profile/ProfileHeroStage'
import { SIZE, SPACE } from '../lib/design/tokens'
/* eslint-enable import/first */

const stage = (props: Partial<React.ComponentProps<typeof ProfileHeroStage>> = {}) => (
  <ProfileHeroStage testID="hero" width={390} photos={[]} name="Priya" age={26} seed="Quiet Heron" {...props} />
)

describe('the hero stage', () => {
  it('is 1.3 times the width tall', async () => {
    await render(stage())
    const style = StyleSheet.flatten(screen.getByTestId('hero').props.style)
    expect(style.height).toBe(507)
    expect(style.width).toBe(390)
  })

  it('draws the creature, and says anonymous, when there is no photo and they have not revealed', async () => {
    await render(stage({ anonymous: true }))
    expect(screen.getByTestId('hero-creature')).toBeTruthy()
    expect(screen.getByText('Anonymous until you both reveal')).toBeTruthy()
  })

  it('draws the creature without the note for a friend with no photos', async () => {
    await render(stage())
    expect(screen.getByTestId('hero-creature')).toBeTruthy()
    expect(screen.queryByText('Anonymous until you both reveal')).toBeNull()
  })

  it('draws one blurred still, never the pager, from the server’s derivative', async () => {
    await render(stage({ blurredUri: 'https://cdn/blur.jpg', anonymous: true }))
    expect(screen.getByTestId('hero-blurred')).toBeTruthy()
    expect(screen.queryByTestId('hero-photo-0')).toBeNull()
  })

  it('reads the name and age as one heading', async () => {
    await render(stage())
    expect(screen.getByRole('header', { name: 'Priya, 26' })).toBeTruthy()
  })

  it('draws pips for a set and none for one photo', async () => {
    const view = await render(stage({ photos: ['a', 'b', 'c'] }))
    expect(screen.getByTestId('hero-pips', { includeHiddenElements: true }).children).toHaveLength(3)
    await view.unmount()
    await render(stage({ photos: ['a'] }))
    expect(screen.queryByTestId('hero-pips', { includeHiddenElements: true })).toBeNull()
  })

  it('opens the viewer at the photo that was tapped', async () => {
    const onPressPhoto = jest.fn()
    await render(stage({ photos: ['a', 'b'], onPressPhoto }))
    fireEvent.press(screen.getByTestId('hero-photo-1'))
    expect(onPressPhoto).toHaveBeenCalledWith(1, { x: 0, y: 0, width: 390, height: 507 })
  })
})

describe('the bar', () => {
  const bar = async (y: number, props: Partial<React.ComponentProps<typeof ProfileBar>> = {}) => {
    const scrollY = makeMutable(y)
    await render(<ProfileBar testID="bar" scrollY={scrollY} title="Priya" onBack={jest.fn()} overPhoto {...props} />)
    return scrollY
  }

  it('is first in the tree, with Back before everything else', async () => {
    await bar(0, { actions: [{ icon: 'ellipsis', label: 'Report or block', onPress: jest.fn() }] })
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(labels).toEqual(['Back', 'Report or block'])
  })

  it('keeps the glass mounted and starts it clear, so scrolling brings it up instead of popping it in', async () => {
    await bar(0)
    const glass = screen.getByTestId('bar-glass')
    expect(glass).toBeTruthy()
    expect(StyleSheet.flatten(glass.props.style).opacity).toBe(0)
  })

  it('keeps the small title out of the reading order', async () => {
    await bar(100)
    const title = screen.getByTestId('bar-title', { includeHiddenElements: true })
    expect(title.props.accessibilityElementsHidden).toBe(true)
  })

  it('sits the circles under the safe-area top, a gap down', async () => {
    await bar(0)
    const style = StyleSheet.flatten(screen.getByTestId('bar').props.style)
    expect(style.paddingTop).toBe(INSET_TOP + SPACE.sm)
  })

  it('has no Back on a tab root', async () => {
    await bar(0, { onBack: undefined, actions: [{ icon: 'settings', label: 'Settings', onPress: jest.fn() }] })
    expect(screen.queryByLabelText('Back')).toBeNull()
    expect(screen.getByLabelText('Settings')).toBeTruthy()
  })
})

describe('the paged viewer', () => {
  const photos = ['a', 'b', 'c']

  it('Close is a labelled 44 pt button under the island, first', async () => {
    const onClose = jest.fn()
    await render(<PhotoViewer photos={photos} visible onClose={onClose} testID="v" />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[0].props.accessibilityLabel).toBe('Close')
    fireEvent.press(buttons[0])
    expect(onClose).toHaveBeenCalledTimes(1)
    const holder = StyleSheet.flatten(buttons[0].parent?.parent?.props.style)
    expect(holder.top).toBe(INSET_TOP + SPACE.sm)
    expect(SIZE.circleButton).toBeGreaterThanOrEqual(44)
  })

  it('says where you are in the set as one label, and a single photo has no counter', async () => {
    const view = await render(<PhotoViewer photos={photos} initialIndex={1} visible onClose={jest.fn()} testID="v" />)
    expect(screen.getByLabelText('Photo 2 of 3')).toBeTruthy()
    expect(screen.getByLabelText('Photo 2')).toBeTruthy()
    await view.unmount()
    await render(<PhotoViewer photos={['a']} visible onClose={jest.fn()} testID="v" />)
    expect(screen.queryByTestId('v-counter')).toBeNull()
  })

  it('draws its chrome above the pager, first in the tree, so the pager cannot take Close’s taps', async () => {
    await render(<PhotoViewer photos={photos} visible onClose={jest.fn()} testID="v" />)
    // fireEvent ignores stacking, so the layer's own z-order is what is asserted.
    const chrome = StyleSheet.flatten(screen.getByTestId('v-chrome').props.style)
    expect(chrome.zIndex).toBe(2)
    expect(chrome.elevation).toBe(2)
    const root = screen.getByTestId('v-chrome').parent
    expect(root?.children[1]).toBe(screen.getByTestId('v-chrome'))
  })

  it('draws nothing when it is closed', async () => {
    await render(<PhotoViewer photos={photos} visible={false} onClose={jest.fn()} testID="v" />)
    expect(screen.queryByLabelText('Close')).toBeNull()
  })
})
