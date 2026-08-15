#!/usr/bin/env bash
#
# Build the startup animation from the ProRes master.
#
#   ./scripts/build-intro-animation.sh "/path/to/#LogoAnimation_Transparent1.mov"
#
# ## Why the master cannot ship as-is
#
# It is Apple ProRes 4444 (`ap4h`), 1920x1080, 29.97fps, **8.575 seconds**, with
# a real alpha channel and a PCM audio track. An editing codec no phone decodes,
# at a length nobody waits through on app launch.
#
# ## What this does, and why each step
#
# 1. **Trim to 0-5.50s.** The tail is cut; the head is deliberately kept.
#
#    The tail first. The animation is *not* over at 4.6s, which a coarse contact
#    sheet suggested and which was wrong. A coloured wipe trails the letters as
#    they draw, and it is still sitting on the final "n" well past that point —
#    cutting at 4.65s left the last letter visibly unfinished. Counting
#    saturated pixels in the wordmark region frame by frame puts the last of it
#    leaving at **5.43s**, so the cut is 5.50s. Everything after that is a
#    static hold carrying the end of the audio.
#
#    The head used to start at 1.55s, and that was the wrong call. The master
#    opens by drawing the monogram from nothing over ~1.6s. The reasoning for
#    skipping it was that the native splash already shows the completed
#    monogram, so drawing it again would erase a logo the user is looking at —
#    true, but the conclusion was wrong. What actually shipped was a launch
#    whose first ~800ms is a *static* monogram: the logo's own animation, the
#    best part of the artwork, never played at all.
#
#    The erase-and-redraw problem is real and is solved in the component
#    instead, with a short black hold between the splash and the animation. A
#    cut to black reads as a cut; a logo dissolving back to nothing reads as a
#    bug. That one beat buys the whole draw-on, so the head now starts at 0.
#
#    Frame 0 is fully transparent (the first drawn pixels land at 0.10s), which
#    costs one frame and is harmless — the component's black hold is what the
#    timing is actually tuned on.
# 2. **Speed up 3x** to ~1.8s. A launch animation people see every single time
#    has to be brief; several seconds of logo is a toll booth. The rate is
#    unchanged from the 1.55s cut — the extra half-second is the draw-on that
#    cut was throwing away, not a slower playback.
# 3. **Crop to the artwork.** The logo occupies 916x440 of the 1920x1080 frame.
#    Shipping the empty margin spends the pixel budget on nothing.
#
#    This window was measured against the *whole* master, not just the tail:
#    the union of every frame's alpha bounding box from 0 to 5.5s is
#    x=527..1398, y=340..734, which sits inside it. So including the head
#    changes no geometry — same 720x346 output, same aspect, and therefore the
#    component's travel numbers and `lockup-hero.png` are untouched.
# 4. **Recolour the wordmark to white.** This is the important one — see below.
# 5. **Encode animated WebP** with alpha, play-once.
#
# ## The recolour
#
# The master was authored against a light background: the monogram is the
# orange->purple gradient, but the wordmark is the dark brand ink #1B1931. On our
# black background it measures a mean luminance of 3/255 — invisible. The
# animation would have shipped as a gradient mark writing on nothing.
#
# The two separate cleanly because the gradient is saturated and the ink is
# near-neutral, so a saturation threshold recolours the wordmark to white and
# leaves the monogram alone. Alpha is untouched throughout, so antialiasing is
# preserved exactly. This reconstructs the white-knockout version of the
# animation, the same way `extract-logo-alpha.py` reconstructs the white
# knockout logos that were flattened away.
#
# ## Requirements
#
#   brew install ffmpeg webp
#
# Note: Homebrew's ffmpeg ships no WebP encoder, hence `img2webp` from `webp`.
# APNG was measured as the alternative and came out at 5.8 MB against 478 KB.
set -euo pipefail

SRC="${1:?usage: build-intro-animation.sh <path to LogoAnimation .mov>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/logo/intro.webp"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 720px wide is ~3x the on-screen width, right for the densest phones.
FILTER="trim=0:5.50,setpts=0.33*(PTS-STARTPTS),crop=916:440:503:319,fps=24,scale=720:-2:flags=lanczos"

echo "1/3 extracting frames (-an strips the audio track)"
ffmpeg -v error -y -i "$SRC" -vf "$FILTER" -an "$WORK/f%03d.png"
echo "    $(ls "$WORK" | wc -l | tr -d ' ') frames"

echo "2/3 recolouring the wordmark to white"
python3 - "$WORK" <<'PY'
import sys, glob
import numpy as np
from PIL import Image

work = sys.argv[1]
SAT_THRESHOLD = 40   # max(RGB)-min(RGB); the gradient is far above, ink far below

for path in sorted(glob.glob(f"{work}/*.png")):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.int16)
    rgb, alpha = a[..., :3], a[..., 3]
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    # Neutral *and* actually drawn: the wordmark. Alpha is left alone, so the
    # antialiased edge keeps its exact coverage and only the colour changes.
    ink = (saturation < SAT_THRESHOLD) & (alpha > 8)
    rgb[ink] = 255
    Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8)).save(path)
PY

echo "3/4 encoding animated WebP"
img2webp -loop 1 -d 42 -lossy -q 82 -m 6 "$WORK"/*.png -o "$OUT" >/dev/null
printf "    %s  %.0f KB\n" "$OUT" "$(( $(stat -f%z "$OUT") / 1024 ))"

# The animation's final frame, as a still.
#
# The sign-in screen needs the same composition the animation lands on —
# gradient monogram beside a white wordmark — and no such asset exists in the
# supplied artwork: `lockup-white.png` is white throughout, and
# `monogram-gradient.png` is the mark alone. Showing both of those stacked
# renders the monogram twice, once on its own and once inside the lockup.
#
# Taking the last frame guarantees the still and the animation agree exactly,
# because it *is* the animation, so the handoff when the overlay fades is
# invisible rather than a jump between two near-identical images.
echo "4/4 extracting the final frame as the static hero"
HERO="$ROOT/assets/logo/lockup-hero.png"
LAST="$(ls "$WORK"/*.png | tail -1)"
python3 - "$LAST" "$HERO" <<'PY'
import sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert("RGBA"))
ys, xs = np.where(a[..., 3] > 8)          # crop to the artwork, as the logos are
pad = 6
y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + 1 + pad)
x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + 1 + pad)
out = Image.fromarray(a[y0:y1, x0:x1])
out.save(sys.argv[2], optimize=True)
print(f"    {sys.argv[2]}  {out.width}x{out.height}  aspect {out.width / out.height:.3f}")
PY
