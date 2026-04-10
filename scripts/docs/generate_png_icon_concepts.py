from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZE = 1024
SCALE = 2
CANVAS = SIZE * SCALE
RADIUS = 224 * SCALE
OUT_DIR = Path("docs/reference/app-icons-v3")
THUMB_DIR = OUT_DIR / "png-192"
CONTACT_SHEET = OUT_DIR / "contact-sheet.png"


def scale_point(x: float, y: float) -> tuple[float, float]:
    return x * SCALE, y * SCALE


def sample_cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 80,
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = (
            (mt**3) * p0[0]
            + 3 * (mt**2) * t * p1[0]
            + 3 * mt * (t**2) * p2[0]
            + (t**3) * p3[0]
        )
        y = (
            (mt**3) * p0[1]
            + 3 * (mt**2) * t * p1[1]
            + 3 * mt * (t**2) * p2[1]
            + (t**3) * p3[1]
        )
        points.append(scale_point(x, y))
    return points


def sample_arc(
    cx: float,
    cy: float,
    r: float,
    start_deg: float,
    end_deg: float,
    steps: int = 120,
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        deg = start_deg + (end_deg - start_deg) * t
        rad = math.radians(deg)
        points.append(scale_point(cx + math.cos(rad) * r, cy + math.sin(rad) * r))
    return points


def stroke_path(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    color: str,
    width: float,
) -> None:
    stroke = int(width * SCALE)
    draw.line(points, fill=color, width=stroke, joint="curve")
    radius = stroke // 2
    for x, y in points:
      draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def new_icon(bg: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, CANVAS, CANVAS), radius=RADIUS, fill=bg)
    return image, draw


def finalize(image: Image.Image) -> Image.Image:
    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def monogram_soft() -> Image.Image:
    image, draw = new_icon("#3182F6")
    points = [
        scale_point(292, 736),
        scale_point(292, 372),
        scale_point(394, 372),
        scale_point(512, 544),
        scale_point(630, 372),
        scale_point(732, 372),
        scale_point(732, 736),
    ]
    stroke_path(draw, points, "white", 116)
    return finalize(image)


def monogram_sharp() -> Image.Image:
    image, draw = new_icon("#111827")
    points = [
        scale_point(306, 734),
        scale_point(306, 350),
        scale_point(410, 350),
        scale_point(512, 500),
        scale_point(614, 350),
        scale_point(718, 350),
        scale_point(718, 734),
    ]
    stroke_path(draw, points, "white", 112)
    return finalize(image)


def monogram_bridge() -> Image.Image:
    image, draw = new_icon("#F8FAFC")
    points = [
        scale_point(302, 734),
        scale_point(302, 392),
        scale_point(418, 392),
        scale_point(512, 486),
        scale_point(606, 392),
        scale_point(722, 392),
        scale_point(722, 734),
    ]
    stroke_path(draw, points, "#172033", 124)
    return finalize(image)


def orbit_open() -> Image.Image:
    image, draw = new_icon("#111827")
    arc = sample_arc(512, 544, 238, 310, 680)
    stroke_path(draw, arc, "white", 118)
    spoke = [
        scale_point(458, 522),
        scale_point(640, 386),
    ]
    stroke_path(draw, spoke, "white", 96)
    return finalize(image)


def orbit_match() -> Image.Image:
    image, draw = new_icon("#3182F6")
    arc = sample_arc(512, 538, 228, 324, 690)
    stroke_path(draw, arc, "white", 110)
    spoke = [
        scale_point(488, 532),
        scale_point(662, 414),
    ]
    stroke_path(draw, spoke, "white", 88)
    return finalize(image)


def orbit_radar() -> Image.Image:
    image, draw = new_icon("#F8FAFC")
    arc = sample_arc(512, 540, 230, 330, 688)
    stroke_path(draw, arc, "#172033", 108)
    spoke = [
        scale_point(520, 530),
        scale_point(638, 430),
    ]
    stroke_path(draw, spoke, "#172033", 86)
    return finalize(image)


def pillars_wide() -> Image.Image:
    image, draw = new_icon("#F8FAFC")
    cap = sample_cubic((340, 414), (438, 314), (586, 314), (684, 414), 100)
    stroke_path(draw, cap, "#172033", 88)
    for x, top in [(340, 416), (512, 398), (684, 416)]:
        stroke_path(draw, [scale_point(x, 726), scale_point(x, top)], "#172033", 108)
    return finalize(image)


def pillars_tilt() -> Image.Image:
    image, draw = new_icon("#111827")
    cap = sample_cubic((324, 430), (428, 326), (586, 326), (700, 414), 100)
    stroke_path(draw, cap, "white", 86)
    specs = [
        ((330, 724), (434, 448)),
        ((512, 724), (534, 430)),
        ((694, 724), (686, 408)),
    ]
    for p0, p1 in specs:
        stroke_path(draw, [scale_point(*p0), scale_point(*p1)], "white", 108)
    return finalize(image)


def pillars_arch() -> Image.Image:
    image, draw = new_icon("#3182F6")
    cap = sample_cubic((332, 420), (430, 338), (594, 338), (692, 420), 100)
    stroke_path(draw, cap, "white", 92)
    for x, top in [(338, 428), (512, 406), (686, 428)]:
        stroke_path(draw, [scale_point(x, 726), scale_point(x, top)], "white", 110)
    return finalize(image)


CONCEPTS = {
    "01-monogram-soft": monogram_soft,
    "02-monogram-sharp": monogram_sharp,
    "03-monogram-bridge": monogram_bridge,
    "04-orbit-open": orbit_open,
    "05-orbit-match": orbit_match,
    "06-orbit-radar": orbit_radar,
    "07-pillars-wide": pillars_wide,
    "08-pillars-tilt": pillars_tilt,
    "09-pillars-arch": pillars_arch,
}


def build_contact_sheet(images: dict[str, Image.Image]) -> None:
    cols = 3
    rows = 3
    card = 420
    gutter = 32
    label_h = 44
    pad = 48
    canvas_w = pad * 2 + cols * card + (cols - 1) * gutter
    canvas_h = pad * 2 + rows * (card + label_h) + (rows - 1) * gutter
    sheet = Image.new("RGBA", (canvas_w, canvas_h), "#F3F6FB")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for idx, (name, image) in enumerate(images.items()):
        row = idx // cols
        col = idx % cols
        x = pad + col * (card + gutter)
        y = pad + row * (card + label_h + gutter)
        thumb = image.resize((card, card), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x, y), thumb)
        draw.text((x + 4, y + card + 12), name, fill="#172033", font=font)

    sheet.convert("RGB").save(CONTACT_SHEET)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    generated: dict[str, Image.Image] = {}

    for name, factory in CONCEPTS.items():
        image = factory()
        image.save(OUT_DIR / f"{name}.png")
        image.resize((192, 192), Image.Resampling.LANCZOS).save(THUMB_DIR / f"{name}.png")
        generated[name] = image

    build_contact_sheet(generated)


if __name__ == "__main__":
    main()
