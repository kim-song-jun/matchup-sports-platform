---
"v1_api": patch
"v1_web": patch
---

Make the tournament operations console read as one product. Mock tournaments now publish their bracket, so an "in progress" mock no longer shows an empty bracket and schedule to everyone watching. The five screens inside the operations shell share one page header instead of three different title sizes and three different content widths, the result screens no longer nest a second `main` landmark inside the shell's, empty result lists offer the step that fills them, and the sidebar keeps the full tournament name in a tooltip when it truncates.
