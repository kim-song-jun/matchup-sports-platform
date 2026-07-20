---
"v1_api": patch
---

Patch multer's DoS (deeply nested field names) and incomplete-cleanup-of-aborted-uploads vulnerabilities by upgrading @nestjs/platform-express (and the lockstep-released @nestjs/common, core, websockets, platform-socket.io, testing) to the release that pins the fixed multer version.
