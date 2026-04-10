from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZE = 1024
SCALE = 2
CANVAS = SIZE * SCALE
RADIUS = 224 * SCALE
OUT_DIR = Path("docs/reference/app-icons-v4")
THUMB_DIR = OUT_DIR / "png-192"
CONTACT_SHEET = OUT_DIR / "contact-sheet.png"


def s(x: float, y: float) -> tuple[float, float]:
    return x * SCALE, y * SCALE


def new_icon(bg: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, CANVAS, CANVAS), radius=RADIUS, fill=bg)
    return image, draw


def finalize(image: Image.Image) -> Image.Image:
    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


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
        points.append(s(cx + math.cos(rad) * r, cy + math.sin(rad) * r))
    return points


def sample_cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 100,
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
        points.append(s(x, y))
    return points


def stroke_path(draw: ImageDraw.ImageDraw, points: list[tuple[float, float]], color: str, width: float) -> None:
    stroke = int(width * SCALE)
    draw.line(points, fill=color, width=stroke, joint="curve")
    radius = stroke // 2
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def monogram_variant(bg: str, fg: str, left_x: float, right_x: float, top_y: float, center_y: float, width: float) -> Image.Image:
    image, draw = new_icon(bg)
    points = [
        s(left_x, 734),
        s(left_x, top_y),
        s(left_x + 110, top_y),
        s(512, center_y),
        s(right_x - 110, top_y),
        s(right_x, top_y),
        s(right_x, 734),
    ]
    stroke_path(draw, points, fg, width)
    return finalize(image)


def orbit_variant(bg: str, fg: str, radius: float, start_deg: float, end_deg: float, spoke_start: tuple[float, float], spoke_end: tuple[float, float], ring_width: float, spoke_width: float) -> Image.Image:
    image, draw = new_icon(bg)
    arc = sample_arc(512, 540, radius, start_deg, end_deg)
    stroke_path(draw, arc, fg, ring_width)
    stroke_path(draw, [s(*spoke_start), s(*spoke_end)], fg, spoke_width)
    return finalize(image)


def pillars_variant(bg: str, fg: str, cap_points: tuple[tuple[float, float], tuple[float, float], tuple[float, float], tuple[float, float]], columns: list[tuple[tuple[float, float], tuple[float, float]]], cap_width: float, col_width: float) -> Image.Image:
    image, draw = new_icon(bg)
    cap = sample_cubic(*cap_points)
    stroke_path(draw, cap, fg, cap_width)
    for start, end in columns:
        stroke_path(draw, [s(*start), s(*end)], fg, col_width)
    return finalize(image)


def m_round_blue() -> Image.Image:
    return monogram_variant("#3182F6", "white", 296, 728, 378, 540, 116)


def m_compact_navy() -> Image.Image:
    return monogram_variant("#111827", "white", 330, 694, 352, 500, 106)


def m_bridge_light() -> Image.Image:
    return monogram_variant("#F8FAFC", "#172033", 306, 718, 392, 484, 122)


def m_notch_blue() -> Image.Image:
    return monogram_variant("#3182F6", "white", 314, 710, 364, 512, 112)


def orbit_open_navy() -> Image.Image:
    return orbit_variant("#111827", "white", 236, 312, 684, (458, 522), (642, 386), 118, 94)


def orbit_match_blue() -> Image.Image:
    return orbit_variant("#3182F6", "white", 228, 324, 690, (486, 532), (664, 414), 110, 88)


def orbit_radar_light() -> Image.Image:
    return orbit_variant("#F8FAFC", "#172033", 228, 332, 688, (514, 532), (640, 430), 108, 84)


def orbit_tight_navy() -> Image.Image:
    return orbit_variant("#111827", "white", 212, 320, 674, (494, 522), (642, 402), 104, 84)


def pillars_wide_light() -> Image.Image:
    return pillars_variant(
        "#F8FAFC",
        "#172033",
        ((340, 414), (438, 314), (586, 314), (684, 414)),
        [((340, 726), (340, 418)), ((512, 726), (512, 402)), ((684, 726), (684, 418))],
        88,
        108,
    )


def pillars_tilt_navy() -> Image.Image:
    return pillars_variant(
        "#111827",
        "white",
        ((326, 430), (430, 326), (586, 326), (700, 414)),
        [((330, 724), (434, 450)), ((512, 724), (534, 430)), ((694, 724), (686, 408))],
        86,
        108,
    )


def pillars_arch_blue() -> Image.Image:
    return pillars_variant(
        "#3182F6",
        "white",
        ((332, 420), (430, 338), (594, 338), (692, 420)),
        [((338, 726), (338, 430)), ((512, 726), (512, 410)), ((686, 726), (686, 430))],
        92,
        110,
    )


def pillars_compact_light() -> Image.Image:
    return pillars_variant(
        "#F8FAFC",
        "#172033",
        ((364, 430), (444, 354), (576, 354), (656, 430)),
        [((368, 714), (368, 438)), ((512, 714), (512, 418)), ((656, 714), (656, 438))],
        82,
        100,
    )


CONCEPTS = {
    "01-m-round-blue": m_round_blue,
    "02-m-compact-navy": m_compact_navy,
    "03-m-bridge-light": m_bridge_light,
    "04-m-notch-blue": m_notch_blue,
    "05-orbit-open-navy": orbit_open_navy,
    "06-orbit-match-blue": orbit_match_blue,
    "07-orbit-radar-light": orbit_radar_light,
    "08-orbit-tight-navy": orbit_tight_navy,
    "09-pillars-wide-light": pillars_wide_light,
    "10-pillars-tilt-navy": pillars_tilt_navy,
    "11-pillars-arch-blue": pillars_arch_blue,
    "12-pillars-compact-light": pillars_compact_light,
}


def build_contact_sheet(images: dict[str, Image.Image]) -> None:
    cols = 4
    rows = 3
    card = 340
    gutter = 28
    label_h = 42
    pad = 42
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
        draw.text((x + 2, y + card + 10), name, fill="#172033", font=font)

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
