/*
 * Skia is native: under Jest there is no canvas. Each drawing component is a host node named `sk-<name>` carrying its
 * props, so a test can read what would be drawn; the buffer hooks run their worklet modifier over every index after each
 * commit, as the UI thread would, so a modifier that throws fails the test that renders it.
 */
const React = require('react')

const node = (name) => {
  const Node = ({ children, ...props }) => React.createElement(`sk-${name}`, props, children)
  Node.displayName = name
  return Node
}

// After each commit, as a mapper would run: a shared value read during render warns (Reanimated strict mode).
const buffer = (make) => (size, modifier) => {
  const ref = React.useRef(null)
  if (ref.current?.value.length !== size) ref.current = { value: Array.from({ length: size }, make) }
  React.useEffect(() => ref.current.value.forEach((v, i) => modifier(v, i)))
  return ref.current
}

const rsxform = () => {
  const xf = { scos: 1, ssin: 0, tx: 0, ty: 0 }
  xf.set = (scos, ssin, tx, ty) => Object.assign(xf, { scos, ssin, tx, ty })
  return xf
}

/** An offscreen surface that records what is drawn on it; `offscreen.fail` makes the next one unavailable (no GPU). */
const offscreen = { fail: false, made: [] }
const surface = (width, height) => {
  const calls = []
  const canvas = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) })
  const made = { width, height, calls, image: { snapshot: true, width: () => width, height: () => height } }
  offscreen.made.push(made)
  return { getCanvas: () => canvas, flush: () => calls.push(['flush']), makeImageSnapshot: () => made.image }
}
const paint = () => {
  const p = { props: {} }
  for (const k of ['setBlendMode', 'setAlphaf', 'setImageFilter']) p[k] = (v) => (p.props[k] = v)
  return p
}

module.exports = {
  Canvas: node('Canvas'),
  Atlas: node('Atlas'),
  Group: node('Group'),
  Fill: node('Fill'),
  Rect: node('Rect'),
  Circle: node('Circle'),
  Oval: node('Oval'),
  Paint: node('Paint'),
  Image: node('Image'),
  Blur: node('Blur'),
  RadialGradient: node('RadialGradient'),
  LinearGradient: node('LinearGradient'),
  useRSXformBuffer: buffer(rsxform),
  vec: (x = 0, y = 0) => ({ x, y }),
  rect: (x, y, width, height) => ({ x, y, width, height }),
  AlphaType: { Premul: 2 },
  ColorType: { RGBA_8888: 4 },
  BlendMode: { Plus: 12, Modulate: 13 },
  TileMode: { Decal: 3 },
  offscreen,
  Skia: {
    Color: (c) => Object.assign(new Float32Array([0, 0, 0, 1]), { source: c }),
    XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
    RSXform: rsxform,
    Data: { fromBytes: (bytes) => ({ bytes }) },
    Image: { MakeImage: (info) => ({ info }) },
    Paint: paint,
    ImageFilter: { MakeBlur: (sx, sy, mode, input) => ({ blur: [sx, sy, mode, input] }) },
    Surface: { MakeOffscreen: (w, h) => (offscreen.fail ? null : surface(w, h)) },
  },
}
