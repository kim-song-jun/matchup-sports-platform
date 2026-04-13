#!/usr/bin/env python3
"""Watch Claude Code JSONL session files and extract new screenshots automatically."""

import json, base64, os, sys, time, glob

SESSION_ID = "e2b936f2-c61d-4a7b-a0d8-e5285728e5df"
JSONL_DIR = os.path.expanduser(
    "~/.claude/projects/-Users-kimsungjun-Documents-05--------EtcProjects-sub-project-sports-platform"
)
OUTPUT_DIR = os.path.join(
    "/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform",
    "screenshots/2026-04-13"
)
STATE_FILE = os.path.join(OUTPUT_DIR, ".watch-state.json")
POLL_INTERVAL = 5  # seconds

os.makedirs(OUTPUT_DIR, exist_ok=True)


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {"file_offsets": {}, "next_id": 1}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


seen_hashes = set()

def extract_images_from_obj(obj, results):
    """Recursively find base64 image data in nested JSON, with deduplication."""
    if isinstance(obj, dict):
        if obj.get("type") == "base64" and "data" in obj and "media_type" in obj:
            media_type = obj["media_type"]
            ext = "png" if "png" in media_type else "jpg" if "jpeg" in media_type else "webp" if "webp" in media_type else "png"
            try:
                img_data = base64.b64decode(obj["data"])
                if len(img_data) >= 1024:  # skip tiny images
                    sig = (len(img_data), img_data[:256], img_data[-256:])
                    h = hash(sig)
                    if h not in seen_hashes:
                        seen_hashes.add(h)
                        results.append((ext, img_data))
            except Exception:
                pass
            return
        if obj.get("type") == "image" and "source" in obj:
            extract_images_from_obj(obj["source"], results)
            return
        for v in obj.values():
            extract_images_from_obj(v, results)
    elif isinstance(obj, list):
        for item in obj:
            extract_images_from_obj(item, results)


def scan_new_content(state):
    """Scan the target session main + subagent JSONL files for new content."""
    new_images = []
    # Watch main file + all subagent files
    jsonl_files = [os.path.join(JSONL_DIR, SESSION_ID + ".jsonl")]
    sub_dir = os.path.join(JSONL_DIR, SESSION_ID, "subagents")
    if os.path.isdir(sub_dir):
        jsonl_files += sorted(glob.glob(os.path.join(sub_dir, "*.jsonl")))

    for fpath in jsonl_files:
        fname = os.path.basename(fpath)
        current_size = os.path.getsize(fpath)
        last_offset = state["file_offsets"].get(fname, 0)

        if current_size <= last_offset:
            continue

        with open(fpath, "r") as f:
            f.seek(last_offset)
            remaining = f.read()
            new_offset = f.tell()

        state["file_offsets"][fname] = new_offset

        for line in remaining.strip().split("\n"):
            if not line:
                continue
            if "base64" not in line and "image/png" not in line and "image/jpeg" not in line:
                continue
            try:
                d = json.loads(line)
                extract_images_from_obj(d, new_images)
            except json.JSONDecodeError:
                continue

    return new_images


def main():
    state = load_state()

    # If first run and images already exist, set next_id past existing files
    if state["next_id"] == 1:
        existing = glob.glob(os.path.join(OUTPUT_DIR, "*.[pj][np][g]"))
        existing += glob.glob(os.path.join(OUTPUT_DIR, "*.webp"))
        if existing:
            max_id = 0
            for fp in existing:
                name = os.path.splitext(os.path.basename(fp))[0]
                try:
                    max_id = max(max_id, int(name))
                except ValueError:
                    pass
            state["next_id"] = max_id + 1
            # Mark all current file sizes as already processed
            for fpath in glob.glob(os.path.join(JSONL_DIR, "*.jsonl")):
                fname = os.path.basename(fpath)
                state["file_offsets"][fname] = os.path.getsize(fpath)
            save_state(state)
            print(f"[init] Resuming from image #{state['next_id']:05d}, all existing files marked as processed")

    print(f"[watch] Monitoring {JSONL_DIR}")
    print(f"[watch] Saving to {OUTPUT_DIR}")
    print(f"[watch] Next image ID: {state['next_id']:05d}")
    print(f"[watch] Polling every {POLL_INTERVAL}s — Ctrl+C to stop")
    sys.stdout.flush()

    try:
        while True:
            new_images = scan_new_content(state)
            if new_images:
                for ext, img_data in new_images:
                    filename = f"{state['next_id']:05d}.{ext}"
                    filepath = os.path.join(OUTPUT_DIR, filename)
                    with open(filepath, "wb") as f:
                        f.write(img_data)
                    print(f"[new] {filename} ({len(img_data) // 1024}KB)")
                    sys.stdout.flush()
                    state["next_id"] += 1
                save_state(state)
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        save_state(state)
        print("\n[watch] Stopped. State saved.")


if __name__ == "__main__":
    main()
