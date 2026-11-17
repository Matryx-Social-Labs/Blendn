import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { G, Path, Rect } from 'react-native-svg'
import { toQR } from 'toqr'

import { COLOR, RADIUS } from '../../lib/design/tokens'
import { Avatar } from '../ds/Avatar'
import { personFace } from '../../lib/personFace'

/** toqr's error-correction levels (its `ECLevel` is a const enum, which isolated modules cannot read): H recovers about 30%. */
const EC_HIGH = 2
/** The modules cleared under the face, a square this many wide at the centre: 7 of a 33-module code is under 5% of it. */
const FACE_MODULES = 7
// design-exception: the board's QR (fr.js `qr`, fr.css `.frqr`): a white 24-radius plate, 14 in, the face ringed 5 in white.
const PLATE_PAD = 14
const FACE_RING = 5

/** Every dark module of `url`'s code, and its width in modules (toqr: one byte a module, row by row). */
export function qrModules(url: string): { n: number; dark: (x: number, y: number) => boolean } {
  const bits = toQR(url, EC_HIGH)
  const n = Math.round(Math.sqrt(bits.length))
  return { n, dark: (x, y) => bits[y * n + x] === 1 }
}

/** The three finder squares' top-left corners, drawn as rounded squares rather than modules (they read the same to a scanner). */
const finders = (n: number) => [
  [0, 0],
  [n - 7, 0],
  [0, n - 7],
]
const inFinder = (n: number, x: number, y: number) => finders(n).some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7)

/**
 * Your invite link as a QR code with your face in the middle (Flow 7 2-A): the same URL the link carries, so a phone camera opens
 * the same invite. Error correction H, so the modules under the face are cleared and it still scans. Decorative to a screen reader:
 * the card says what it is ("Scan to ask to be friends"), and the link is shared by the button under it.
 */
export function InviteQr({ url, size, face }: { url: string; size: number; face: { name: string; photo: string | null; size: number } }) {
  const { path, n } = useMemo(() => {
    const code = qrModules(url)
    const lo = Math.floor((code.n - FACE_MODULES) / 2)
    const cleared = (x: number, y: number) => x >= lo && x < lo + FACE_MODULES && y >= lo && y < lo + FACE_MODULES
    let d = ''
    for (let y = 0; y < code.n; y += 1)
      for (let x = 0; x < code.n; x += 1) if (code.dark(x, y) && !inFinder(code.n, x, y) && !cleared(x, y)) d += `M${x} ${y}h1v1h-1z`
    return { path: d, n: code.n }
  }, [url])
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.plate} testID="invite-qr">
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Path d={path} fill={COLOR.ink} />
        {finders(n).map(([x, y]) => (
          <G key={`${x}:${y}`}>
            <Rect x={x} y={y} width={7} height={7} rx={1.6} fill={COLOR.ink} />
            <Rect x={x + 1} y={y + 1} width={5} height={5} rx={1} fill={COLOR.textPrimary} />
            <Rect x={x + 2} y={y + 2} width={3} height={3} rx={0.6} fill={COLOR.ink} />
          </G>
        ))}
      </Svg>
      <View style={[styles.face, { borderRadius: face.size / 2 + FACE_RING, padding: FACE_RING, marginLeft: -(face.size / 2 + FACE_RING), marginTop: -(face.size / 2 + FACE_RING) }]}>
        <Avatar size={face.size} {...personFace({ named: true, name: face.name, photo: face.photo })} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  plate: { alignSelf: 'center', padding: PLATE_PAD, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.textPrimary },
  face: { position: 'absolute', left: '50%', top: '50%', backgroundColor: COLOR.textPrimary },
})
