import { render, screen } from "@testing-library/react-native"
import { CityArtCard } from "../components/cityArt/CityArtCard"
import { CityScene } from "../components/cityArt/CityScene"
import { buildScene } from "../components/cityArt/scenes"
import { SCENE_PALETTES, cityArtFor, timeOfDay, type CityArtKey, type TimeOfDay } from "../lib/cityArt"

/**
 * City art. The drawings are judged by eye; what is tested is what can be
 * wrong without looking wrong in a screenshot of the happy path.
 */
describe("cityArtFor", () => {
  it.each([
    ["Bengaluru", "blr"],
    ["Bangalore", "blr"],
    ["  bengaluru  urban ", "blr"],
    ["Mumbai", "bom"],
    ["Bombay", "bom"],
    ["New Delhi", "del"],
    ["delhi", "del"],
  ])("resolves %p to %p", (city, key) => {
    expect(cityArtFor(city)?.key).toBe(key)
  })

  it("returns null for cities without art, so they render as plain rows", () => {
    expect(cityArtFor("Pune")).toBeNull()
    expect(cityArtFor("")).toBeNull()
    expect(cityArtFor(null)).toBeNull()
    // Not a substring match: "Delhi Cantonment" is not a reason to guess.
    expect(cityArtFor("Delhi Cantonment")).toBeNull()
  })
})

describe("timeOfDay", () => {
  // 2026-09-28 in UTC; IST is UTC+5:30.
  const at = (utc: string) => new Date(`2026-09-28T${utc}Z`)

  it("reads the city's clock, not the phone's", () => {
    expect(timeOfDay(at("06:30:00"), "Asia/Kolkata")).toBe("day") // 12:00 IST
    expect(timeOfDay(at("06:30:00"), "Europe/Berlin")).toBe("day") // 08:30 CEST
    expect(timeOfDay(at("16:00:00"), "Asia/Kolkata")).toBe("night") // 21:30 IST
    expect(timeOfDay(at("16:00:00"), "Europe/Berlin")).toBe("dusk") // 18:00 CEST
  })

  it("puts the boundaries where the drawing changes", () => {
    expect(timeOfDay(at("00:29:00"), "Asia/Kolkata")).toBe("night") // 05:59
    expect(timeOfDay(at("00:30:00"), "Asia/Kolkata")).toBe("day") // 06:00
    expect(timeOfDay(at("11:30:00"), "Asia/Kolkata")).toBe("dusk") // 17:00
    expect(timeOfDay(at("13:30:00"), "Asia/Kolkata")).toBe("night") // 19:00
    expect(timeOfDay(at("18:30:00"), "Asia/Kolkata")).toBe("night") // 00:00, not hour 24
  })
})

const CITIES: CityArtKey[] = ["blr", "bom", "del"]
const TIMES: TimeOfDay[] = ["day", "dusk", "night"]

describe("buildScene", () => {
  it.each(CITIES.flatMap((c) => TIMES.map((t) => [c, t] as const)))("%s at %s has unique layer keys and real boxes", (city, tod) => {
    const layers = buildScene(city, SCENE_PALETTES[tod])
    const keys = layers.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const layer of layers) {
      if ("box" in layer) {
        expect(layer.box.w).toBeGreaterThan(0)
        expect(layer.box.h).toBeGreaterThan(0)
        const phase = layer.motion.phase ?? 0
        expect(phase).toBeGreaterThanOrEqual(0)
        expect(phase).toBeLessThan(1)
      }
    }
  })

  it("only draws stars when the sky is dark enough for them", () => {
    const stars = (tod: TimeOfDay) => buildScene("blr", SCENE_PALETTES[tod]).filter((l) => l.key.startsWith("stars")).length
    expect(stars("day")).toBe(0)
    expect(stars("night")).toBe(2)
  })
})

describe("rendering", () => {
  it.each(CITIES)("mounts %s", async (city) => {
    await render(<CityScene city={city} width={340} height={170} fit="slice" tod="night" />)
  })

  it("labels the picker card with the city and its count, not the drawing", async () => {
    await render(
      <CityArtCard city="Bengaluru" art={cityArtFor("Bengaluru")!} eventCount={26} active here onPress={() => {}} />,
    )
    expect(screen.getByLabelText("Bengaluru, your current location, 26 events")).toBeTruthy()
  })
})

describe("drawableCityArt", () => {
  /*
   * A build without react-native-svg draws red "Unimplemented component" boxes
   * where the skyline should be. Seen on a device on 2026-09-28.
   */
  it("falls back to no art when the SVG native module is missing", () => {
    jest.isolateModules(() => {
      const rn = require("react-native")
      jest.spyOn(rn.TurboModuleRegistry, "get").mockReturnValue(null)
      const { drawableCityArt, SVG_AVAILABLE } = require("../components/cityArt/drawable")
      expect(SVG_AVAILABLE).toBe(false)
      expect(drawableCityArt("Bengaluru")).toBeNull()
    })
  })

  it("uses the art when it is present", () => {
    jest.isolateModules(() => {
      const rn = require("react-native")
      jest.spyOn(rn.TurboModuleRegistry, "get").mockReturnValue({})
      const { drawableCityArt } = require("../components/cityArt/drawable")
      expect(drawableCityArt("Bangalore")?.key).toBe("blr")
    })
  })
})
