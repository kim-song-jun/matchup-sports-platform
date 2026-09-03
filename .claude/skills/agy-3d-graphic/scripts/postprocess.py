#!/usr/bin/env python3
"""agy 로 만든 1024px 투명 PNG 를 검증하고 레포용 webp + 매니페스트로 변환한다.

사용:
  python3 postprocess.py <src.png> <name> --message "<메시지 문장>" --prompt-file <prompt.txt>
      [--sizes 320,640] [--out apps/v1_web/public/illustrations] [--max-kb 60]

검사(하나라도 실패하면 exit 1, 파일을 쓰지 않는다):
  - RGBA 이고 알파 최솟값이 0 (진짜 투명 배경)
  - 불투명 영역의 bbox(경계 사각형)가 캔버스의 25~85% 를 차지 (너무 작거나 꽉 찬 그림 배제)
  - 오브젝트 bbox 가 캔버스 가장자리에 닿지 않음 (잘림 배제)
  - 모서리 4곳이 완전 투명 (배경이 남아 있으면 다크모드에서 흰 판이 뜬다)

변환:
  - bbox 로 트림 후 6% 여백을 두고 정사각형으로 패딩
  - 각 size 로 LANCZOS 축소, webp q85 저장
  - manifest.json 에 {name, message, prompt, source_sha256, sizes, created_at} 갱신(같은 name 은 교체)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow 가 필요하다: pip install pillow")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "apps" / "v1_web").is_dir():
            return parent
    fail("레포 루트를 찾지 못했다 (apps/v1_web 이 없음)")
    raise AssertionError


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("name", help="kebab-case, 예: matches-empty")
    ap.add_argument("--message", required=True)
    ap.add_argument("--prompt-file", required=True)
    ap.add_argument("--sizes", default="320,640")
    ap.add_argument("--out", default="apps/v1_web/public/illustrations")
    ap.add_argument("--max-kb", type=int, default=60)
    args = ap.parse_args()

    if not args.name.replace("-", "").isalnum() or args.name != args.name.lower():
        fail("name 은 소문자 kebab-case 여야 한다")

    src = Path(args.src)
    if not src.is_file():
        fail(f"원본 PNG 가 없다: {src}")
    prompt_path = Path(args.prompt_file)
    if not prompt_path.is_file():
        fail(f"프롬프트 파일이 없다: {prompt_path}")
    try:
        im = Image.open(src)
        im.load()
    except (OSError, Image.UnidentifiedImageError) as exc:
        fail(f"이미지를 열 수 없다: {src} ({exc})")
    if im.mode != "RGBA":
        fail(f"RGBA 가 아니다: {im.mode}. 투명 배경으로 다시 생성한다")
    alpha = im.getchannel("A")
    lo, hi = alpha.getextrema()
    if lo != 0:
        fail(f"알파 최솟값 {lo}: 배경이 투명하지 않다")
    w, h = im.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if alpha.getpixel(corner) != 0:
            fail(f"모서리 {corner} 가 불투명하다: 배경판이 남아 있다")
    bbox = alpha.getbbox()
    if bbox is None:
        fail("불투명 픽셀이 없다")
    x0, y0, x1, y1 = bbox
    if x0 == 0 or y0 == 0 or x1 == w or y1 == h:
        fail(f"오브젝트가 가장자리에 닿아 잘렸다: bbox={bbox}")
    coverage = ((x1 - x0) * (y1 - y0)) / (w * h)
    if not 0.25 <= coverage <= 0.85:
        fail(f"오브젝트 bbox 가 캔버스의 {coverage:.0%} — 25~85% 범위를 벗어난다. 구도 문장을 확인한다")

    # 트림 + 여백 + 정사각형 패딩
    crop = im.crop(bbox)
    side = max(crop.size)
    pad = int(side * 0.06)
    canvas = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    canvas.paste(crop, (pad + (side - crop.width) // 2, pad + (side - crop.height) // 2))

    root = repo_root()
    out_dir = root / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    sizes = [int(s) for s in args.sizes.split(",") if s]
    written: dict[str, dict[str, int]] = {}
    for size in sizes:
        resized = canvas.resize((size, size), Image.LANCZOS)
        target = out_dir / f"{args.name}-{size}.webp"
        resized.save(target, "WEBP", quality=85, method=6)
        kb = target.stat().st_size / 1024
        if kb > args.max_kb:
            target.unlink()
            fail(f"{target.name} 이 {kb:.0f}KB 로 {args.max_kb}KB 를 넘는다. 오브젝트 수나 디테일을 줄인다")
        written[str(size)] = {"bytes": target.stat().st_size}

    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"illustrations": []}
    entry = {
        "name": args.name,
        "message": args.message,
        "prompt": prompt_path.read_text().strip(),
        "source_sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
        "sizes": written,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    manifest["illustrations"] = [e for e in manifest["illustrations"] if e["name"] != args.name] + [entry]
    manifest["illustrations"].sort(key=lambda e: e["name"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    print(f"OK coverage={coverage:.0%} bbox={bbox}")
    for size, meta in written.items():
        print(f"  {args.name}-{size}.webp {meta['bytes'] / 1024:.1f}KB")
    shown = manifest_path.relative_to(root) if manifest_path.is_relative_to(root) else manifest_path
    print(f"  manifest: {shown}")


if __name__ == "__main__":
    main()
