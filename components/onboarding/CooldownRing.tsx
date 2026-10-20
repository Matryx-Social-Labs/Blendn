import Svg, { Circle } from 'react-native-svg'

import { COLOR } from '../../lib/design/tokens'

const SIZE = 20
const STROKE = 2
const RADIUS = (SIZE - STROKE) / 2
const AROUND = 2 * Math.PI * RADIUS

/**
 * The 20 pt ring that drains while Resend waits (Flow 1 forgot 03): a 16% white track and a white arc of what is left of the
 * wait, from the top. Decorative: the label says "Resend in 24s".
 */
export function CooldownRing({ left, total, testID }: { left: number; total: number; testID?: string }) {
  const remaining = Math.max(0, Math.min(1, total > 0 ? left / total : 0))
  return (
    <Svg testID={testID} width={SIZE} height={SIZE} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={COLOR.hairlineStrong} strokeWidth={STROKE} fill="none" />
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke={COLOR.textPrimary}
        strokeWidth={STROKE}
        fill="none"
        strokeDasharray={`${AROUND * remaining} ${AROUND}`}
        strokeLinecap="round"
        rotation={-90}
        origin={`${SIZE / 2}, ${SIZE / 2}`}
      />
    </Svg>
  )
}
