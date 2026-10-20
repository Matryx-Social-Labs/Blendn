import Svg, { Path } from 'react-native-svg'

/*
 * Google's own four-colour "G" (Flow 1 `G`), for Google's own button. Its colours are Google's, from its sign-in branding
 * guidelines, not ours: they stay literal.
 */
const PATHS = [
  // design-exception: Google's brand mark, per Google's branding guidelines
  { fill: '#EA4335', d: 'M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6C12.3 13.6 17.7 9.5 24 9.5z' },
  // design-exception: Google's brand mark, per Google's branding guidelines
  { fill: '#4285F4', d: 'M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z' },
  // design-exception: Google's brand mark, per Google's branding guidelines
  { fill: '#FBBC05', d: 'M10.4 28.8A14.5 14.5 0 0 1 9.5 24c0-1.7.3-3.3.8-4.8l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6z' },
  // design-exception: Google's brand mark, per Google's branding guidelines
  { fill: '#34A853', d: 'M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z' },
] as const

export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PATHS.map((p) => (
        <Path key={p.fill} fill={p.fill} d={p.d} />
      ))}
    </Svg>
  )
}
