/*
 * The location illustration's footer scrim (the merge report's leftover): a CSS `linear-gradient` in
 * `experimental_backgroundImage` does not draw on every architecture (DS-21, A35), so the footer's words could sit on the
 * bare map. It is the DS fade (a LinearGradient) over the top 60% and solid sunken surface under the words.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

/* eslint-disable import/first */
import { LocationIllustration } from '../components/onboarding/PermissionIllustration'
import { COLOR } from '../lib/design/tokens'
import { tint } from '../lib/theme'
/* eslint-enable import/first */

const HIDDEN = { includeHiddenElements: true }

it('fades clear to the sunken surface with the DS fade, then is solid under the words; no CSS gradient', async () => {
  await render(<LocationIllustration city="Bengaluru" />)
  const fade = screen.getByTestId('location-scrim-fade', HIDDEN)
  expect(fade.props.colors).toEqual([tint(COLOR.surfaceSunken, 0), COLOR.surfaceSunken])
  const [fadeFlex, solid] = [StyleSheet.flatten(fade.props.style).flex, screen.getByTestId('location-scrim', HIDDEN).children[1]]
  expect(StyleSheet.flatten((solid as { props: { style: unknown } }).props.style as never)).toMatchObject({ backgroundColor: COLOR.surfaceSunken })
  // Fading over 60%, solid over 40%: the frame's 0% → 60% stop.
  const solidFlex = StyleSheet.flatten((solid as { props: { style: unknown } }).props.style as never).flex as number
  expect(fadeFlex / (fadeFlex + solidFlex)).toBeCloseTo(0.6)
  expect(JSON.stringify(screen.toJSON())).not.toContain('linear-gradient')
  expect(screen.getByText('NEAR YOU · BENGALURU', HIDDEN)).toBeTruthy()
})
