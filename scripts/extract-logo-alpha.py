#!/usr/bin/env python3
"""
Recover transparent logo assets from the flattened brand PNGs.

    python3 scripts/extract-logo-alpha.py <brand-assets-dir>

## Why this exists

The supplied artwork is five 7800x7800 PNGs in **RGB mode with no alpha
channel**, despite the filenames. Two of them are worse than that: `Logos-3`
and `Logos-5` are the white knockout versions, flattened onto white, so they are
byte-identical and contain zero non-white pixels. The artwork is gone.

Everything the app needs is still recoverable from the three that survived,
because the compositing is invertible when you know what was composited.

## The maths

Flattening onto white is `obs = fg*a + 255*(1-a)`.

**Flat-ink logos (2 and 4).** `fg` is a single known colour, #1B1931, so per
channel `a = (255-obs)/(255-ink)`. All three channels agree, so averaging them
just suppresses PNG noise. Exact, and correctly antialiased — this is how the
destroyed knockout versions come back.

**The gradient logo (1).** `fg` varies per pixel, so the same trick has two
unknowns and cannot be solved pixel-by-pixel. The obvious workaround -- key on
distance from white, normalised globally -- is *wrong here* and worth spelling
out: #F15524 sits 219 from white in its darkest channel and #925EA8 sits 161, so
a global normalisation would render every purple interior pixel at ~73% opacity
and eat the top of the gradient.

What makes it exact instead: logo 1 and logo 2 are the **same mark**. Measured
bounding boxes are 3322px wide in both, offset by only a few pixels of export
framing. So logo 2 supplies the alpha and logo 1 supplies the colour, and the
un-multiply `fg = (obs - 255*(1-a)) / a` is then fully determined.

## Outputs (committed; re-run only if the source art changes)

    monogram-gradient.png   the orange->purple mark, true colours
    monogram-white.png      white knockout, tint with expo-image for any colour
    lockup-white.png        mark + wordmark, white knockout
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

INK = np.array([27, 25, 49], dtype=float)  # #1B1931, sampled from the artwork
OUT_SIZE = 1024  # 7800px is 60M pixels of line art nobody needs; Metro would suffer
COVERAGE_FLOOR = 60  # for bbox detection only


def load(path: Path, size: int = OUT_SIZE) -> np.ndarray:
    """Downsample first — Lanczos on the full 7800px costs seconds for no gain."""
    return np.asarray(Image.open(path).convert("RGB").resize((size, size), Image.LANCZOS), dtype=float)


def alpha_from_flat_ink(rgb: np.ndarray) -> np.ndarray:
    """Exact inverse of compositing a single known colour over white."""
    a = (255.0 - rgb) / (255.0 - INK)  # broadcast per channel
    return np.clip(a.mean(axis=2), 0.0, 1.0)


def coverage(rgb: np.ndarray) -> np.ndarray:
    """Hue-independent 'how far from white', for alignment and bbox only."""
    return 255.0 - rgb.min(axis=2)


def best_offset(ref: np.ndarray, mov: np.ndarray, radius: int = 12) -> tuple[int, int]:
    """
    Brute-force the integer shift aligning `mov` onto `ref`.

    Small search: the two exports differ by export framing, not by layout, so
    the answer is a handful of pixels at this resolution.
    """
    ref_n = ref / (ref.max() or 1)
    mov_n = mov / (mov.max() or 1)
    best, best_err = (0, 0), float("inf")
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            shifted = np.roll(np.roll(mov_n, dy, axis=0), dx, axis=1)
            err = np.abs(ref_n - shifted).mean()
            if err < best_err:
                best, best_err = (dy, dx), err
    return best


def write_rgba(rgb: np.ndarray, alpha: np.ndarray, path: Path, pad: int = 8) -> None:
    """
    Write RGBA, cropped to the artwork.

    The source is a square canvas with the mark floating in the middle — the
    lockup occupies a 799x225 band of a 1024x1024 image. Shipped uncropped, any
    layout that sets an `aspectRatio` and `resizeMode="contain"` fits the
    *square* into that box and renders the logo at a fraction of the intended
    size. Cropping to the alpha bounding box makes the file's aspect ratio the
    artwork's aspect ratio, which is the only thing a layout can reason about.
    """
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255.0, 0, 255)]).astype(np.uint8)
    ys, xs = np.where(out[..., 3] > 8)
    if len(xs):
        h, w = out.shape[:2]
        y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + 1 + pad)
        x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + 1 + pad)
        out = out[y0:y1, x0:x1]
    Image.fromarray(out).save(path, optimize=True)
    covered = int((out[..., 3] > 128).sum())
    print(f"  {path.name:24} {out.shape[1]}x{out.shape[0]}  "
          f"aspect {out.shape[1] / out.shape[0]:.3f}  opaque px {covered:,}")


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out_dir = Path(__file__).resolve().parent.parent / "assets" / "logo"
    out_dir.mkdir(parents=True, exist_ok=True)

    def find(stem: str) -> Path:
        hits = sorted(src.rglob(f"*Logos-{stem}.png"))
        if not hits:
            sys.exit(f"could not find *Logos-{stem}.png under {src}")
        return hits[0]

    gradient_rgb = load(find("1"))
    mono_rgb = load(find("2"))
    lockup_rgb = load(find("4"))

    print("Extracting alpha:")

    # --- white knockouts: exact, single unknown -------------------------------
    mono_alpha = alpha_from_flat_ink(mono_rgb)
    white = np.full_like(mono_rgb, 255.0)
    write_rgba(white, mono_alpha, out_dir / "monogram-white.png")

    lockup_alpha = alpha_from_flat_ink(lockup_rgb)
    write_rgba(np.full_like(lockup_rgb, 255.0), lockup_alpha, out_dir / "lockup-white.png")

    # --- gradient: alpha borrowed from the identical mark, colour un-multiplied
    dy, dx = best_offset(coverage(gradient_rgb), coverage(mono_rgb))
    aligned = np.roll(np.roll(mono_alpha, dy, axis=0), dx, axis=1)
    print(f"  aligned the mask by (dy={dy}, dx={dx}) before un-multiplying")

    a = np.clip(aligned, 0.0, 1.0)[..., None]
    safe = np.where(a < 0.02, 1.0, a)  # avoid dividing by ~0 on transparent pixels
    fg = (gradient_rgb - 255.0 * (1.0 - a)) / safe
    fg = np.where(a < 0.02, 255.0, fg)
    write_rgba(fg, aligned, out_dir / "monogram-gradient.png")

    # Sanity: the recovered colours should still be the brand's, not muddied.
    strong = aligned > 0.9
    if strong.sum():
        px = np.clip(fg[strong], 0, 255).astype(int)
        print(f"  recovered ink range R{px[:,0].min()}-{px[:,0].max()} "
              f"G{px[:,1].min()}-{px[:,1].max()} B{px[:,2].min()}-{px[:,2].max()}")


if __name__ == "__main__":
    main()
