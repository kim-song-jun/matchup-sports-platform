---
'v1_api': minor
'v1_web': minor
---

Add an admin error log viewer. Server and client errors were only written to the process log, so investigating one meant opening a shell on the box and reading container output that disappears on restart. Errors now persist with their traceback, request, response, and the server release they happened on, and the admin screen lists them with a detail modal that copies any section — or the whole thing — as markdown ready to paste into an issue. Repeat occurrences fold into a single row with a count (24 hours for 401/403, one hour otherwise) so a flood of the same error never buries the rest. Values under sensitive keys are redacted before anything is written, including secrets that arrive inside a URL query string rather than a field.
