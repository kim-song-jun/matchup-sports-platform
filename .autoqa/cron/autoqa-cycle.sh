#!/usr/bin/env bash
set -euo pipefail
cd "/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform"
node scripts/qa/run-autoqa.mjs --scope core >> "/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/.autoqa/cron/autoqa.log" 2>&1
