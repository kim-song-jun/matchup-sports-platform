---
"v1_api": patch
"v1_web": patch
---

Run the one-time certbot config migration rsync (old ALPHA_LIVE_DIR layout to the new persistent ALPHA_RUNTIME_CONFIG_DIR) with sudo. The deploy script runs as ec2-user, but certbot's archive/live directories are root-owned by design, so the copy failed with rsync Permission denied on the first real run of the immutable-release migration path.
