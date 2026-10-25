import type { Sheet } from './sheet'

/**
 * The sheet a row that says Blend'n+ opens where it is free during launch (review H2): it sells nothing and says so. One
 * sentence of ours, so Settings and Me cannot say it two ways.
 */
export const PLUS_FREE_SHEET: Sheet = {
  kind: 'actions',
  hue: 'violet',
  icon: 'sparkles',
  title: 'Blend’n+ is free here for now',
  message: "During launch in your city, staying live while you’re here and your full night history are everyone’s. There’s nothing to buy.",
  actions: [{ label: 'Got it', variant: 'primary', then: () => {} }],
}
