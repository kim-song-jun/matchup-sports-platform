---
'v1_api': patch
'v1_web': patch
---

Harden the SSH-remnant guard that was supposed to prevent the failed production deploy. The pattern only matched a bare `ssh ec2`, so `ssh -o StrictHostKeyChecking=yes ec2` or `ssh -F config ec2` would have sailed through CI and died at deploy time exactly like the bug the guard was added for; it also stripped only whole-line comments, so explaining the transition next to a line of code (`cmd  # used to be ssh ec2`) falsely blocked deploys. Detection now allows options with attached or separate arguments, strips trailing comments, and is exercised by a test table wired into Gates so a future weakening of the pattern fails CI instead of surfacing during a release.
