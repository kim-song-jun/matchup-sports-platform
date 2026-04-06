# Realtime Load Test — RealtimeGateway (Socket.IO)

k6-based load test targeting the MatchUp NestJS WebSocket gateway at `ws://localhost:8100`.

---

## Prerequisites

### 1. Install k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Other: https://k6.io/docs/get-started/installation/
```

### 2. API server running

```bash
docker compose up -d          # PostgreSQL + Redis
cd apps/api && pnpm start:dev # NestJS on :8100
```

### 3. Raise socket limits (macOS)

macOS defaults to 256 open file descriptors per process. 1000 concurrent sockets will hit this limit.

```bash
ulimit -n 4096
```

Add to `~/.zshrc` or `~/.bashrc` to persist:

```bash
echo 'ulimit -n 4096' >> ~/.zshrc
```

---

## Generate JWT Tokens

The test script loads one JWT per line from a tokens file. Generate tokens using the
`dev-login` endpoint (development environment only — blocked in production):

```bash
# Generate 1000 test user tokens (requires jq)
for i in $(seq 1 1000); do
  curl -s -X POST http://localhost:8100/api/v1/auth/dev-login \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"load-test-user-${i}\"}" \
  | jq -r '.data.accessToken'
done > infra/load/tokens.txt

# Verify
wc -l infra/load/tokens.txt   # should print 1000
```

> Note: `tokens.txt` is gitignored. Never commit JWTs.

---

## Run the Test

```bash
# Default: 1000 VUs, 60s hold, ws://localhost:8100
ulimit -n 4096
k6 run infra/load/realtime-load.js \
  -e BASE_URL=ws://localhost:8100 \
  -e JWT_TOKENS_FILE=infra/load/tokens.txt \
  -e VUS=1000

# Shorter smoke test (50 VUs, 15s hold)
k6 run infra/load/realtime-load.js \
  -e BASE_URL=ws://localhost:8100 \
  -e JWT_TOKENS_FILE=infra/load/tokens.txt \
  -e VUS=50 \
  -e DURATION=15

# Custom room ID
k6 run infra/load/realtime-load.js \
  -e TEST_ROOM_ID=my-room-uuid \
  ...
```

### Makefile shortcut (if using make)

```makefile
load-test:
	ulimit -n 4096 && k6 run infra/load/realtime-load.js \
	  -e BASE_URL=ws://localhost:8100 \
	  -e JWT_TOKENS_FILE=infra/load/tokens.txt \
	  -e VUS=1000
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `ws://localhost:8100` | WebSocket server base URL |
| `JWT_TOKENS_FILE` | `./tokens.txt` | Path to newline-separated JWT file |
| `VUS` | `1000` | Number of virtual users (concurrent connections) |
| `DURATION` | `60` | Hold duration in seconds after ramp-up |
| `TEST_ROOM_ID` | `load-test-room` | Socket.IO chat room ID for the test |

---

## Test Scenario

```
0s ──── ramp-up 30s ──→ 1000 VUs ──── hold 60s ──→ ramp-down 10s ──→ 0 VUs
```

Each VU:
1. Connects to `/socket.io/?EIO=4&transport=websocket&token=<JWT>`
2. Sends Socket.IO namespace connect packet (`40`)
3. Joins chat room: `chat:join { roomId }`
4. Sends `chat:message` every 2 seconds with an embedded `_ts` timestamp
5. Measures roundtrip latency when own messages are echoed back
6. Responds to Socket.IO heartbeat pings (`2` → `3`)
7. Sends `chat:leave` and disconnects gracefully at end

---

## Custom Metrics

| Metric | Type | Description |
|---|---|---|
| `ws_connect_duration` | Trend (ms) | Time from `ws.connect()` call to WebSocket open |
| `ws_message_latency` | Trend (ms) | Roundtrip: send timestamp → receive broadcast |
| `ws_messages_received` | Counter | Total `chat:message` events received across all VUs |
| `ws_connect_failures` | Counter | Connections that failed before sending any data |

---

## Thresholds (pass/fail criteria)

| Threshold | Target |
|---|---|
| `ws_message_latency` p95 | < 300ms |
| `ws_message_latency` p99 | < 800ms |
| `ws_connect_failures` count | < 1% of VUS (< 10 for 1000 VUs) |
| `checks` pass rate | > 99% |

The k6 run exits with code 99 if any threshold is breached.

---

## Sample Expected Output

```
✓ WebSocket connected successfully

ws_connect_duration.............: avg=42ms   min=8ms  med=38ms  max=312ms  p(90)=89ms   p(95)=118ms
ws_message_latency..............: avg=28ms   min=4ms  med=24ms  max=540ms  p(90)=62ms   p(95)=91ms p(99)=220ms
ws_messages_received............: 24500   408/s
ws_connect_failures.............: 2
checks..........................: 99.80% ✓ 998 ✗ 2

✓ ws_message_latency p(95)<300
✓ ws_message_latency p(99)<800
✓ ws_connect_failures count<10
✓ checks rate>0.99
```

If p95 > 300ms, check:
- Redis latency (`redis-cli ping`)
- NestJS event loop lag (add `--inspect` and profile)
- OS socket buffer limits (`ulimit -n`)
- Network MTU / loopback throughput

---

## Notes

- **Socket.IO v4 protocol**: The script manually encodes/decodes the Socket.IO framing (`42[...]` events, `40` connect, `2`/`3` heartbeat). This is necessary because k6's `ws` module speaks raw WebSocket, not Socket.IO.
- **Latency measurement**: Latency is measured end-to-end including server broadcast (send → own echo received). This tests the full server roundtrip, not just transport.
- **Token file security**: `tokens.txt` must not be committed. Add `infra/load/tokens.txt` to `.gitignore` if not already present.
- **Staging runs**: Replace `BASE_URL` with `wss://api.your-domain.com` for staging. TLS handshake adds ~20-40ms to connect duration.
