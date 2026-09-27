/**
 * City art, only where this binary can draw it.
 *
 * `react-native-svg` is native. A JS bundle that reaches a build made before it
 * was added — an `eas update` to an installed app, or Metro serving a dev client
 * that predates it — renders every `Svg` as a red "Unimplemented component:
 * <RNSVGSvgView>" box. That happened on a device on 2026-09-28, in the city
 * picker. Such a build gets the plain rows and the glyph instead, which is
 * what it had before.
 *
 * The probe is the library's own TurboModule, which ships in the same pod as
 * the view components: `get` (not `getEnforcing`) returns null when it is
 * absent rather than throwing.
 */
import { TurboModuleRegistry } from 'react-native'
import { cityArtFor, type CityArtInfo } from '../../lib/cityArt'

function probe(): boolean {
  try {
    return TurboModuleRegistry.get('RNSVGSvgViewModule') != null
  } catch {
    return false
  }
}

export const SVG_AVAILABLE = probe()

/** `cityArtFor`, or null when this build has no SVG renderer. Screens call this one. */
export function drawableCityArt(city: string | null | undefined): CityArtInfo | null {
  return SVG_AVAILABLE ? cityArtFor(city) : null
}
