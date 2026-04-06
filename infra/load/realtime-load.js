/**
 * k6 WebSocket load test for MatchUp RealtimeGateway (Socket.IO)
 *
 * Env vars:
 *   BASE_URL          WebSocket base URL (default: ws://localhost:8100)
 *   JWT_TOKENS_FILE   Path to newline-delimited JWT file (default: ./tokens.txt)
 *   VUS               Virtual users (default: 1000)
 *   DURATION          Hold duration in seconds (default: 60)
 *   TEST_ROOM_ID      Chat room ID to join (default: load-test-room)
 *
 * Usage:
 *   k6 run infra/load/realtime-load.js \
 *     -e BASE_URL=ws://localhost:8100 \
 *     -e JWT_TOKENS_FILE=./tokens.txt \
 *     -e VUS=1000
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
// open() is a k6 built-in global (available in init context, no import needed)

// ─── Custom metrics ─────────────────────────────────────────────────────────

const wsConnectDuration = new Trend('ws_connect_duration', true);
const wsMessageLatency = new Trend('ws_message_latency', true);
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectFailures = new Counter('ws_connect_failures');

// ─── Configuration ───────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:8100';
const JWT_TOKENS_FILE = __ENV.JWT_TOKENS_FILE || './tokens.txt';
const VUS = parseInt(__ENV.VUS || '1000', 10);
const DURATION_SECS = parseInt(__ENV.DURATION || '60', 10);
const TEST_ROOM_ID = __ENV.TEST_ROOM_ID || 'load-test-room';

// Load JWTs from file into a SharedArray (read once, shared across VUs).
// open() is a k6 built-in available only in the init context (top-level scope).
// It returns the file contents as a string.
const tokens = new SharedArray('jwt-tokens', function () {
  try {
    // eslint-disable-next-line no-undef
    const raw = open(JWT_TOKENS_FILE);
    return raw
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  } catch (_) {
    // Sentinel: allows the script to load/inspect even without the token file.
    // The VU function will detect this and fail cleanly with a counter increment.
    return ['__MISSING_TOKEN__'];
  }
});

// ─── Scenario / thresholds ───────────────────────────────────────────────────

export const options = {
  scenarios: {
    realtime_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },        // ramp-up
        { duration: `${DURATION_SECS}s`, target: VUS }, // hold
        { duration: '10s', target: 0 },           // ramp-down
      ],
      gracefulRampDown: '10s',
    },
  },

  thresholds: {
    // p95 message latency under 300ms
    ws_message_latency: ['p(95)<300', 'p(99)<800'],

    // Connection success rate > 99%
    // ws_connect_failures must stay below 1% of total VU connections
    ws_connect_failures: ['count<' + Math.ceil(VUS * 0.01)],

    // Standard k6 HTTP checks (not used here but good practice to keep passing)
    checks: ['rate>0.99'],
  },
};

// ─── Socket.IO handshake helpers ─────────────────────────────────────────────

/**
 * Encode a Socket.IO packet.
 * Socket.IO v4 uses a text protocol where:
 *   "2" = EVENT packet type
 *   "42[\"event\",{data}]" = EVENT with JSON payload
 */
function encodeEvent(eventName, data) {
  return '42' + JSON.stringify([eventName, data]);
}

/**
 * Decode a received Socket.IO frame.
 * Returns { type, eventName, data } or null if not parseable.
 */
function decodeFrame(raw) {
  if (typeof raw !== 'string') return null;
  // Socket.IO v4 prefix codes: 0=connect, 2=event, 3=ack, 4=disconnect
  const packetType = raw.charAt(0);
  if (packetType === '0') return { type: 'connect', data: null };
  if (packetType === '2' || packetType === '3') {
    try {
      // "42[...]" → strip leading "42"
      const jsonStart = raw.indexOf('[');
      if (jsonStart === -1) return { type: 'event', eventName: null, data: null };
      const arr = JSON.parse(raw.slice(jsonStart));
      return { type: 'event', eventName: arr[0], data: arr[1] };
    } catch (_) {
      return { type: 'event', eventName: null, data: null };
    }
  }
  return null;
}

// ─── VU function ─────────────────────────────────────────────────────────────

export default function () {
  // Pick a JWT round-robin by VU index (0-based)
  const vuIndex = (__VU - 1) % tokens.length;
  const token = tokens[vuIndex];

  if (token === '__MISSING_TOKEN__') {
    console.error(
      `JWT_TOKENS_FILE not found or empty. Provide a valid file path via -e JWT_TOKENS_FILE=./tokens.txt`,
    );
    wsConnectFailures.add(1);
    return;
  }

  // Socket.IO v4 requires EIO=4 + transport=websocket + sid handshake.
  // k6 ws opens a raw WebSocket, so we build the Socket.IO URL manually.
  const url =
    `${BASE_URL}/socket.io/?EIO=4&transport=websocket` +
    `&token=${encodeURIComponent(token)}`;

  const connectStart = Date.now();
  let connected = false;
  let messageSendInterval = null;
  let pingInterval = null;

  const res = ws.connect(url, {}, function (socket) {
    // ── Connection open ────────────────────────────────────────────────────
    socket.on('open', function () {
      const connectMs = Date.now() - connectStart;
      wsConnectDuration.add(connectMs);
      connected = true;

      // Socket.IO v4: send "40" (connect packet for namespace "/")
      socket.send('40');
    });

    // ── Message handler ────────────────────────────────────────────────────
    socket.on('message', function (raw) {
      const frame = decodeFrame(raw);
      if (!frame) return;

      if (frame.type === 'connect') {
        // Successfully joined the namespace → join chat room
        socket.send(encodeEvent('chat:join', { roomId: TEST_ROOM_ID }));

        // Send a chat:message every 2 seconds
        messageSendInterval = setInterval(function () {
          const sendTs = Date.now();
          socket.send(
            encodeEvent('chat:message', {
              roomId: TEST_ROOM_ID,
              message: `load-test-msg-${sendTs}`,
              _ts: sendTs,
            }),
          );
        }, 2000);

        // Socket.IO heartbeat: send "3" (pong) whenever we get a "2" (ping)
      }

      if (frame.type === 'event') {
        if (frame.eventName === 'chat:message') {
          wsMessagesReceived.add(1);
          // Measure latency if our own timestamp is echoed back
          const payload = frame.data;
          if (payload && payload._ts) {
            const latencyMs = Date.now() - payload._ts;
            wsMessageLatency.add(latencyMs);
          }
        }
      }

      // Socket.IO v4 ping/pong (raw "2" ping frame → reply "3" pong)
      if (raw === '2') {
        socket.send('3');
      }
    });

    // ── Error handler ──────────────────────────────────────────────────────
    socket.on('error', function (e) {
      if (!connected) {
        wsConnectFailures.add(1);
      }
      console.warn(`WS error (VU ${__VU}):`, e ? e.toString() : 'unknown');
    });

    // ── Close handler ──────────────────────────────────────────────────────
    socket.on('close', function () {
      if (!connected) {
        wsConnectFailures.add(1);
      }
    });

    // Hold the connection for ramp-down grace period
    sleep(DURATION_SECS + 5);

    // Graceful leave before disconnect
    if (connected) {
      socket.send(encodeEvent('chat:leave', { roomId: TEST_ROOM_ID }));
      sleep(0.1);
    }
  });

  // k6 ws.connect check
  check(res, {
    'WebSocket connected successfully': (r) => r && r.status === 101,
  });
}
