#!/usr/bin/env python3
"""
Generates the app's icon set (not part of the app runtime): assets/icon.png,
android-icon-background.png, android-icon-foreground.png, android-icon-monochrome.png and
notification-icon.png (the white status-bar silhouette).

The design is a friendly bus front — a white rounded body with wing mirrors, a glassy windshield,
two headlights and a number plate — on the app's teal-to-cyan colours, with faint transit-map
route lines and stops behind it.

Everything is drawn from geometry at 4x resolution and downsampled, so edges are clean and any
tweak (colours, proportions, size) is a one-line change here followed by a re-run, rather than
hand-editing image files.

Usage: python scripts/generate-icons.py [output-dir]      (default: assets/)
Requires Pillow and numpy.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SIZE = 1024
SS = 4  # supersampling factor — draw at SIZE*SS, then shrink
W = SIZE * SS

# Brand colours (src/theme.ts): primary is the deep teal-blue, accent the bright cyan.
PRIMARY = (11, 79, 108)
SKY = (18, 168, 200)   # bright end of the background gradient
DEEP = (6, 44, 66)     # dark end of the background gradient

# Android's adaptive-icon mask can crop to a circle ~626px across, so everything in the
# foreground layer must stay within ~313px of the center. K scales the whole bus; the largest
# value that still clears that limit is ~1.3.
CX = CY = 512
K = 1.28

# Extra enlargement for the iOS icon only (the Android layers keep the safe-zone size) — iOS has no
# adaptive-icon safe zone, so the artwork can fill the square better.
IOS_ARTWORK_SCALE = 1.1


def k(value):
    return round(value * K)


def s(value):
    return value * SS


# Bus body, centred on the canvas.
BODY_W, BODY_H, BODY_R = k(340), k(380), k(78)
BODY_LEFT = CX - BODY_W // 2
BODY_RIGHT = BODY_LEFT + BODY_W
BODY_TOP = CY - BODY_H // 2
BODY_BOTTOM = BODY_TOP + BODY_H

# Windshield: a wide rounded window across the upper body.
WS_INSET, WS_TOP_OFFSET, WS_H, WS_R = k(44), k(62), k(162), k(38)
WS_TOP = BODY_TOP + WS_TOP_OFFSET
WS_BOTTOM = WS_TOP + WS_H

# Wing mirrors: small rounded tabs sticking out either side — the "ears" that give it its charm.
MIRROR_TOP, MIRROR_BOTTOM = BODY_TOP + k(78), BODY_TOP + k(168)
MIRROR_OUT, MIRROR_IN, MIRROR_R = k(34), k(30), k(14)

# Headlights and number plate along the bottom.
LIGHT_Y, LIGHT_DX, LIGHT_R = BODY_BOTTOM - k(86), k(96), k(32)
PLATE_HALF_W, PLATE_UP, PLATE_DOWN, PLATE_R = k(46), k(12), k(14), k(12)


def solid(color, mask):
    """An RGBA layer of one colour, visible only where `mask` is."""
    return Image.merge("RGBA", (*[Image.new("L", (W, W), c) for c in color], mask))


def with_opacity(mask, opacity):
    return mask.point(lambda v: int(v * opacity))


def new_layer():
    return Image.new("RGBA", (W, W), (0, 0, 0, 0))


def shrink(img):
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def scale_about_center(img, factor):
    """Enlarges `img` about its center, keeping the canvas size (edges are cropped)."""
    crop = round(W / factor)
    offset = (W - crop) // 2
    return img.crop((offset, offset, offset + crop, offset + crop)).resize((W, W), Image.LANCZOS)


# --- Geometry helpers --------------------------------------------------------------------------

def bezier(p0, p1, p2, p3, steps=500):
    t = np.linspace(0, 1, steps)[:, None]
    p0, p1, p2, p3 = (np.array(p, dtype=float) for p in (p0, p1, p2, p3))
    pts = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3
    return [tuple(p) for p in pts]


def stroke_mask(points, width):
    """A smooth thick line: a dense run of round stamps, which (unlike stroking many tiny
    segments) leaves no serrated edge."""
    mask = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(mask)
    r = s(width) / 2
    for x, y in points:
        d.ellipse([s(x) - r, s(y) - r, s(x) + r, s(y) + r], fill=255)
    return mask


def linear_gradient(top_right, bottom_left):
    """Diagonal gradient: `top_right` colour in the top-right corner, `bottom_left` opposite."""
    ys, xs = np.mgrid[0:W, 0:W].astype(np.float32)
    t = (((xs / W) + (1 - ys / W)) / 2.0)[..., None]  # 0 at bottom-left .. 1 at top-right
    a = np.array(bottom_left, dtype=np.float32)
    b = np.array(top_right, dtype=np.float32)
    return Image.fromarray((a + (b - a) * t).astype(np.uint8), "RGB").convert("RGBA")


# --- Artwork masks ------------------------------------------------------------------------------

def body_mask():
    """The whole solid shape: bus body plus the two wing mirrors."""
    mask = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([s(BODY_LEFT), s(BODY_TOP), s(BODY_RIGHT), s(BODY_BOTTOM)], radius=s(BODY_R), fill=255)
    d.rounded_rectangle(
        [s(BODY_LEFT - MIRROR_OUT), s(MIRROR_TOP), s(BODY_LEFT + MIRROR_IN), s(MIRROR_BOTTOM)], radius=s(MIRROR_R), fill=255
    )
    d.rounded_rectangle(
        [s(BODY_RIGHT - MIRROR_IN), s(MIRROR_TOP), s(BODY_RIGHT + MIRROR_OUT), s(MIRROR_BOTTOM)], radius=s(MIRROR_R), fill=255
    )
    return mask


def windshield_mask():
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [s(BODY_LEFT + WS_INSET), s(WS_TOP), s(BODY_RIGHT - WS_INSET), s(WS_BOTTOM)], radius=s(WS_R), fill=255
    )
    return mask


def details_mask():
    """Everything cut out of the white body: windshield, headlights and number plate."""
    mask = windshield_mask()
    d = ImageDraw.Draw(mask)
    for offset in (-LIGHT_DX, LIGHT_DX):
        d.ellipse(
            [s(CX + offset - LIGHT_R), s(LIGHT_Y - LIGHT_R), s(CX + offset + LIGHT_R), s(LIGHT_Y + LIGHT_R)], fill=255
        )
    d.rounded_rectangle(
        [s(CX - PLATE_HALF_W), s(LIGHT_Y - PLATE_UP), s(CX + PLATE_HALF_W), s(LIGHT_Y + PLATE_DOWN)],
        radius=s(PLATE_R), fill=255,
    )
    return mask


def glare_mask():
    """Two thin diagonal glints across the windshield, clipped to it — the touch that makes it glass."""
    glare = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(glare)
    x0 = BODY_LEFT + WS_INSET
    slant = k(46)
    for start, width in ((k(70), k(34)), (k(128), k(14))):
        d.polygon(
            [
                (s(x0 + start), s(WS_TOP)),
                (s(x0 + start + width), s(WS_TOP)),
                (s(x0 + start + width - slant), s(WS_BOTTOM)),
                (s(x0 + start - slant), s(WS_BOTTOM)),
            ],
            fill=255,
        )
    return ImageChops.multiply(glare, windshield_mask())


# --- Layers -------------------------------------------------------------------------------------

def make_background():
    """Gradient plus faint transit-map route lines with stops — decorative, so it may be cropped."""
    bg = linear_gradient(SKY, DEEP)

    lines = [
        bezier((-100, 800), (250, 830), (430, 300), (1130, 250)),
        bezier((-100, 250), (420, 300), (600, 800), (1130, 830)),
    ]
    routes = Image.new("L", (W, W), 0)
    stop_points = []
    for pts in lines:
        routes = ImageChops.lighter(routes, stroke_mask(pts, 38))
        stop_points += [pts[int(frac * (len(pts) - 1))] for frac in (0.09, 0.91)]
    bg.alpha_composite(solid((255, 255, 255), with_opacity(routes, 0.13)))

    ring = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(ring)
    for x, y in stop_points:
        d.ellipse([s(x - 40), s(y - 40), s(x + 40), s(y + 40)], fill=255)
    for x, y in stop_points:
        d.ellipse([s(x - 20), s(y - 20), s(x + 20), s(y + 20)], fill=0)
    bg.alpha_composite(solid((255, 255, 255), with_opacity(ring, 0.30)))
    return bg


def make_foreground():
    """Transparent layer: soft shadow, white bus body, teal details, windshield glints."""
    body = body_mask()
    layer = new_layer()

    shadow = ImageChops.offset(body.filter(ImageFilter.GaussianBlur(s(20))), 0, s(22))
    layer.alpha_composite(solid((0, 0, 0), with_opacity(shadow, 0.30)))
    layer.alpha_composite(solid((255, 255, 255), body))

    layer.alpha_composite(solid(PRIMARY, details_mask()))
    layer.alpha_composite(solid((255, 255, 255), with_opacity(glare_mask(), 0.20)))
    return layer


def make_monochrome():
    """Single-colour silhouette for Android 13+ themed icons: the system tints the opaque pixels,
    so the windshield, lights and plate are cut out (transparent) rather than drawn in a second
    colour."""
    return solid((255, 255, 255), ImageChops.subtract(body_mask(), details_mask()))


def make_notification_icon(monochrome):
    """96x96 all-white silhouette for the Android status bar, where notification icons must be a
    single colour: the bus cropped tight and centred so it fills the icon instead of floating in
    it (the full-size artwork has a lot of empty margin, which would render tiny up there)."""
    left, top, right, bottom = monochrome.split()[3].getbbox()
    side = max(right - left, bottom - top)
    center_x, center_y = (left + right) // 2, (top + bottom) // 2
    half = side // 2 + round(side * 0.08)
    crop = monochrome.crop((center_x - half, center_y - half, center_x + half, center_y + half))
    return crop.resize((96, 96), Image.LANCZOS)


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "assets"
    out_dir.mkdir(parents=True, exist_ok=True)

    background = make_background()
    foreground = make_foreground()

    # iOS (and Android < 8) use one opaque, full-bleed square — the OS rounds the corners itself.
    combined = background.copy()
    combined.alpha_composite(scale_about_center(foreground, IOS_ARTWORK_SCALE))
    shrink(combined).convert("RGB").save(out_dir / "icon.png")

    # Android adaptive icon: separate layers so the launcher can mask/animate them.
    shrink(background).convert("RGB").save(out_dir / "android-icon-background.png")
    shrink(foreground).save(out_dir / "android-icon-foreground.png")
    monochrome = shrink(make_monochrome())
    monochrome.save(out_dir / "android-icon-monochrome.png")
    make_notification_icon(monochrome).save(out_dir / "notification-icon.png")
    print(f"Wrote icon set to {out_dir}")


if __name__ == "__main__":
    main()
