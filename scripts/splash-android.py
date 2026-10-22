#!/usr/bin/env python3
"""Android 12+ splash icon: the optically centred monogram inside the system's 2/3 safe circle.

Canvas: Expo's 288 dp splash canvas (the plugin's `canvasSize`). Android 12 shows only a circle 192 dp across
(2/3 of 288) of a background-less icon. The monogram is drawn at the iOS splash's 118 pt width, centred on the
canvas by the source PNG's own (optical) centre, and every inked pixel must sit inside 0.95 of that circle.
"""
import math, sys
from PIL import Image

# Usage: python3 scripts/splash-android.py  (from the repo root; writes the asset and every density of the committed res)
SRC = 'assets/logo/monogram-gradient-centred.png'
ASSET = 'assets/logo/splash-android.png'
RES = 'android/app/src/main/res'
src_path = SRC
CANVAS_DP, SAFE_DP, MARK_DP = 288, 192, 118
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

src = Image.open(src_path).convert('RGBA')
for name, m in DENSITIES.items():
    canvas = round(CANVAS_DP * m)
    mark_w = round(MARK_DP * m)
    mark_h = round(src.height * mark_w / src.width)
    mark = src.resize((mark_w, mark_h), Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    out.paste(mark, ((canvas - mark_w) // 2, (canvas - mark_h) // 2), mark)
    # The check: the farthest inked pixel from the canvas centre, against the safe circle.
    a = out.getchannel('A').load()
    c = (canvas - 1) / 2
    far = max(math.hypot(x - c, y - c) for y in range(canvas) for x in range(canvas) if a[x, y] > 8)
    limit = SAFE_DP * m / 2 * 0.95
    assert far <= limit, (name, far, limit)
    for night in ('', 'night-'):
        out.save(f'{RES}/drawable-{night}{name}/splashscreen_logo.png', optimize=True)
    if name == 'xxxhdpi':
        out.save(ASSET, optimize=True)
    print(name, canvas, 'mark', mark_w, 'x', mark_h, 'far', round(far / m, 1), 'dp of', SAFE_DP / 2)
