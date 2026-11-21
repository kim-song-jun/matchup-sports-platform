// Line shapes copied from the 11-20 incident (docker logs --timestamps) and nginx `combined`.
// Client addresses use the documentation range 203.0.113.0/24.
export const HEAP_FATAL_1 =
  '2026-11-20T01:50:47.803569805Z FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';
export const HEAP_FATAL_2 =
  '2026-11-20T02:02:59.150362759Z FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory';
export const GC_LINE =
  '2026-11-20T01:50:47.803511554Z [1:0x7fa8a6add000]   598112 ms: Mark-Compact 248.7 (258.6) -> 247.8 (258.8) MB, pooled: 1 MB, 335.47 / 0.00 ms  (average mu = 0.208, current mu = 0.099) allocation failure; scavenge might not succeed';
export const READY_LINE = '2026-11-20T01:53:36.488744757Z ✓ Ready in 0ms';

const ts = '2026-11-20T01:50:30.123456789Z';
export const NGINX_OK =
  `${ts} 203.0.113.7 - - [20/Nov/2026:01:50:30 +0000] "GET /teams/12 HTTP/1.1" 200 5123 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"`;
export const NGINX_502 =
  `${ts} 203.0.113.8 - - [20/Nov/2026:01:50:31 +0000] "GET /api/v1/health HTTP/1.1" 502 157 "-" "ELB-HealthChecker/2.0"`;
export const NGINX_504 =
  `${ts} 203.0.113.9 - - [20/Nov/2026:01:50:32 +0000] "GET /tournaments/3 HTTP/1.1" 504 167 "https://teameet.co.kr/" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.3; +https://openai.com/gptbot)"`;
export const NGINX_GPT_200 =
  `${ts} 203.0.113.10 - - [20/Nov/2026:01:50:33 +0000] "GET /terms?q=1 HTTP/1.1" 200 900 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.3; +https://openai.com/gptbot)"`;
export const NGINX_QUOTED_UA =
  `${ts} 203.0.113.11 - - [20/Nov/2026:01:50:34 +0000] "GET /x HTTP/1.1" 200 10 "-" "weird \\"quoted\\" agent Bytespider"`;
export const NGINX_503 =
  `${ts} 203.0.113.12 - - [20/Nov/2026:01:50:36 +0000] "GET /api/v1/teams HTTP/1.1" 503 197 "-" "python-requests/2.31"`;
// Written once per rejected request (limit_req_log_level defaults to error); the matching access line is NGINX_503.
export const NGINX_LIMIT_REQ_LINE =
  `${ts} 2026/11/20 01:50:36 [error] 29#29: *7 limiting requests, excess: 60.500 by zone "v1api", client: 203.0.113.12, server: teameet.co.kr, request: "GET /api/v1/teams HTTP/1.1", host: "teameet.co.kr"`;
export const NGINX_LIMIT_REQ_DRY_RUN =
  `${ts} 2026/11/20 01:50:36 [error] 29#29: *8 limiting requests, dry run, excess: 60.500 by zone "v1api", client: 203.0.113.12, server: teameet.co.kr, request: "GET /x HTTP/1.1", host: "teameet.co.kr"`;
export const NGINX_ERROR_LOG_LINE =
  `${ts} 2026/11/20 01:50:35 [error] 29#29: *1 connect() failed (111: Connection refused) while connecting to upstream`;

export const MEMINFO = `MemTotal:        1953124 kB
MemFree:           91824 kB
MemAvailable:     499712 kB
Buffers:           41160 kB
Cached:           701352 kB
SwapCached:        18400 kB
SwapTotal:       2097148 kB
SwapFree:        1637372 kB
`;

export const DF = `Filesystem     1024-blocks     Used Available Capacity Mounted on
/dev/nvme0n1p1    31444972 17806144  13638828      57% /
`;

export const OPENSSL = 'notAfter=Jan  1 03:21:07 2027 GMT\n';
