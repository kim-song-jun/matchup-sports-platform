# unhealthy 컨테이너 자동 재시작

`restart: always` 는 프로세스가 끝났을 때만 컨테이너를 다시 띄워요. 건강검사가 계속 실패해도 Docker 는
`unhealthy` 로 표시만 해서, heap 한계 근처에서 GC 만 도는 웹이 죽기 전 수십 분 동안 504 를 냈어요.
`deploy/restart-unhealthy.sh` 와 systemd 타이머가 그런 컨테이너를 다시 띄워요.

## 동작

- 30초마다 앱 컨테이너(`teameet_v1_web`, `teameet_v1_web_b`, `teameet_v1_api`, `teameet_v1_game_operations_worker`)의
  건강 상태를 봐요. nginx · postgres 는 대상이 아니에요.
- `unhealthy` 가 120초 이상 이어진 컨테이너만 `docker restart` 해요. Docker 가 `unhealthy` 로 표시하는 데도 연속 실패가
  필요해서(웹 약 2분), 실제로는 약 4분 안팎에 다시 떠요. 중간에 `healthy` · `starting` 이 되면 세던 시간을 지워요.
- 같은 컨테이너는 600초 안에 두 번 다시 띄우지 않아요. DB 가 죽어 API 가 unhealthy 인 때처럼 재시작이 해결책이 아닌 경우에
  재시작이 반복되지 않게 해요.
- 배포 잠금(`/home/ec2-user/.teameet-prod-deploy.lock`)을 배포가 쥐고 있으면 아무것도 하지 않아요. 잠금 파일은 읽기로만 열고
  새로 만들지 않아요.
- 기록은 `/run/teameet-restart-unhealthy/`(재부팅하면 사라져요)에 있고, 로그는 `journalctl -u teameet-restart-unhealthy` 로 봐요.

## 한계

- 웹 건강검사는 `/landing`(ISR 5분 캐시)이라 API 가 멈춰도 통과할 수 있어요. 이 도구는 Docker 가 `unhealthy` 로 판정한 것만
  다뤄요. 건강검사를 더 정확하게 만드는 일은 별개예요.
- 재시작은 해당 컨테이너의 종료 여유(`stop_grace_period`)를 기다려요.

## 설치 (서버 작업이라 승인 뒤에 해요)

백업 타이머와 같은 방식이에요.

```bash
sudo install -m 0750 deploy/restart-unhealthy.sh /usr/local/bin/teameet-restart-unhealthy.sh
sudo install -m 0644 deploy/systemd/teameet-restart-unhealthy.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/teameet-restart-unhealthy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teameet-restart-unhealthy.timer
```

확인: `systemctl list-timers teameet-restart-unhealthy.timer` · `sudo systemctl start teameet-restart-unhealthy.service` 한 번 돌려 `journalctl` 에 오류가 없는지 봐요.
끄기: `sudo systemctl disable --now teameet-restart-unhealthy.timer`.
