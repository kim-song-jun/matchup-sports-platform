#!/usr/bin/env bash
#
# Cloudflare 엣지 IP 대역을 두 곳에 동기화한다.
#
#   1) deploy/cloudflare-real-ip.conf      — nginx 가 신뢰할 프록시 목록(real_ip)
#   2) ALB 보안 그룹 인바운드 규칙          — origin 잠금 (--sg 지정 시)
#
# Cloudflare 는 대역을 드물게(연 1~2회) 바꾼다. 바뀐 걸 놓치면
#   · nginx 쪽: 새 엣지에서 온 요청의 실사용자 IP 를 못 집어 rate limit 이 합산으로 붕괴
#   · SG 쪽:   새 엣지가 origin 에 닿지 못해 전면 502
# 둘 다 조용히 터지므로 정기적으로(또는 Cloudflare 공지 시) 돌린다.
#
# 사용법:
#   scripts/infra/sync-cloudflare-ips.sh                       # 변경 여부만 확인 (기본 dry-run)
#   scripts/infra/sync-cloudflare-ips.sh --write               # conf 파일 갱신
#   scripts/infra/sync-cloudflare-ips.sh --sg sg-0123abc       # SG 차이도 함께 출력 (dry-run)
#   scripts/infra/sync-cloudflare-ips.sh --sg sg-0123abc --apply-sg   # SG 실제 반영
#
# 종료 코드: 0 = 변경 없음 / 2 = 변경 필요 (dry-run) — CI 에서 드리프트 게이트로 쓸 수 있다.

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF="${REPO_ROOT}/deploy/cloudflare-real-ip.conf"
API='https://api.cloudflare.com/client/v4/ips'

write=false
apply_sg=false
sg_id=''
# SG 에서 Cloudflare 로 잠글 포트. 443 만 잠그는 것이 기본이다 —
# 80 은 301 리다이렉트와 Let's Encrypt HTTP-01 챌린지만 처리하고, LE 검증 서버는
# 임의 IP 에서 오므로 잠그면 인증서 갱신이 조용히 실패한다. 80 까지 잠그려면
# 먼저 DNS-01 로 갱신 방식을 바꾼 뒤 PORTS=443,80 으로 실행할 것.
PORTS="${PORTS:-443}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write) write=true; shift ;;
    --sg) sg_id="${2:-}"; shift 2 ;;
    --apply-sg) apply_sg=true; shift ;;
    -h|--help) sed -n '2,25p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 64 ;;
  esac
done

for bin in curl jq; do
  command -v "${bin}" >/dev/null || { echo "${bin} 가 필요합니다" >&2; exit 69; }
done

echo "[cloudflare-ips] ${API} 에서 대역을 받는 중..."
payload="$(curl -fsS --max-time 20 --retry 3 --retry-delay 2 "${API}")"
jq -e '.success == true' >/dev/null <<< "${payload}" || {
  echo "[cloudflare-ips] API 가 success=false 를 반환했습니다:" >&2
  jq -r '.errors' <<< "${payload}" >&2
  exit 1
}

etag="$(jq -er '.result.etag' <<< "${payload}")"
# mapfile/readarray 는 bash 4+ 전용이라 쓰지 않는다 — macOS 기본 bash 는 3.2 이고,
# 이 스크립트는 개발자 노트북에서 드리프트 확인용으로도 돌린다.
v4=(); v6=()
while IFS= read -r cidr; do [[ -n "${cidr}" ]] && v4+=("${cidr}"); done < <(jq -er '.result.ipv4_cidrs[]' <<< "${payload}")
while IFS= read -r cidr; do [[ -n "${cidr}" ]] && v6+=("${cidr}"); done < <(jq -er '.result.ipv6_cidrs[]' <<< "${payload}")
(( ${#v4[@]} > 0 && ${#v6[@]} > 0 )) || { echo "[cloudflare-ips] 대역 목록이 비었습니다 — 중단" >&2; exit 1; }
echo "[cloudflare-ips] IPv4 ${#v4[@]}개 · IPv6 ${#v6[@]}개 · etag ${etag}"

# ── 1) nginx include 파일 ────────────────────────────────────────────────────
# 헤더 주석(설명)은 사람이 유지하고, 생성 스크립트는 메타데이터 3줄과 대역 목록만 교체한다.
tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

awk -v etag="${etag}" -v today="$(date -u +%Y-%m-%d)" '
  /^#   etag: / { print "#   etag: " etag; next }
  /^#   수집: / { print "#   수집: " today; next }
  /^# IPv4$/   { print; exit }
  { print }
' "${CONF}" > "${tmp}"

printf 'set_real_ip_from %s;\n' "${v4[@]}" >> "${tmp}"
printf '\n# IPv6\n' >> "${tmp}"
printf 'set_real_ip_from %s;\n' "${v6[@]}" >> "${tmp}"

conf_changed=false
if ! diff -q "${CONF}" "${tmp}" >/dev/null 2>&1; then
  conf_changed=true
  echo "[cloudflare-ips] deploy/cloudflare-real-ip.conf 에 차이가 있습니다:"
  diff -u "${CONF}" "${tmp}" | sed 's/^/    /' || true
  if [[ "${write}" == true ]]; then
    cp "${tmp}" "${CONF}"
    echo "[cloudflare-ips] → 갱신했습니다. nginx 재시작이 필요합니다:"
    echo "                   bind mount 는 파일을 갈아끼우면 inode 가 바뀌어 reload 로는"
    echo "                   반영되지 않습니다 — up -d --force-recreate --no-deps nginx"
  fi
else
  echo "[cloudflare-ips] deploy/cloudflare-real-ip.conf 는 최신입니다."
fi

# ── 2) ALB 보안 그룹 ────────────────────────────────────────────────────────
sg_changed=false
if [[ -n "${sg_id}" ]]; then
  command -v aws >/dev/null || { echo "aws CLI 가 필요합니다" >&2; exit 69; }
  echo "[cloudflare-ips] 보안 그룹 ${sg_id} 확인 (포트: ${PORTS})"

  IFS=',' read -ra ports <<< "${PORTS}"
  for port in "${ports[@]}"; do
    current="$(aws ec2 describe-security-groups --group-ids "${sg_id}" \
      --query "SecurityGroups[0].IpPermissions[?FromPort==\`${port}\`].[IpRanges[].CidrIp, Ipv6Ranges[].CidrIpv6]" \
      --output text | tr '\t' '\n' | grep -v '^$' | sort -u || true)"
    desired="$(printf '%s\n' "${v4[@]}" "${v6[@]}" | sort -u)"

    to_add="$(comm -13 <(printf '%s\n' "${current}") <(printf '%s\n' "${desired}"))"
    to_remove="$(comm -23 <(printf '%s\n' "${current}") <(printf '%s\n' "${desired}"))"

    if [[ -z "${to_add}" && -z "${to_remove}" ]]; then
      echo "[cloudflare-ips]   :${port} — 이미 일치"
      continue
    fi
    sg_changed=true
    [[ -n "${to_add}" ]]    && { echo "[cloudflare-ips]   :${port} 추가 필요:"; sed 's/^/      + /' <<< "${to_add}"; }
    [[ -n "${to_remove}" ]] && { echo "[cloudflare-ips]   :${port} 제거 필요:"; sed 's/^/      - /' <<< "${to_remove}"; }

    if [[ "${apply_sg}" == true ]]; then
      # 추가를 먼저 하고 제거를 나중에 한다 — 순서가 반대면 그 사이에 트래픽이 끊긴다.
      while read -r cidr; do
        [[ -z "${cidr}" ]] && continue
        if [[ "${cidr}" == *:* ]]; then
          aws ec2 authorize-security-group-ingress --group-id "${sg_id}" \
            --ip-permissions "IpProtocol=tcp,FromPort=${port},ToPort=${port},Ipv6Ranges=[{CidrIpv6=${cidr},Description=cloudflare}]" >/dev/null
        else
          aws ec2 authorize-security-group-ingress --group-id "${sg_id}" \
            --ip-permissions "IpProtocol=tcp,FromPort=${port},ToPort=${port},IpRanges=[{CidrIp=${cidr},Description=cloudflare}]" >/dev/null
        fi
        echo "[cloudflare-ips]   :${port} + ${cidr}"
      done <<< "${to_add}"

      while read -r cidr; do
        [[ -z "${cidr}" ]] && continue
        if [[ "${cidr}" == *:* ]]; then
          aws ec2 revoke-security-group-ingress --group-id "${sg_id}" \
            --ip-permissions "IpProtocol=tcp,FromPort=${port},ToPort=${port},Ipv6Ranges=[{CidrIpv6=${cidr}}]" >/dev/null
        else
          aws ec2 revoke-security-group-ingress --group-id "${sg_id}" \
            --ip-permissions "IpProtocol=tcp,FromPort=${port},ToPort=${port},IpRanges=[{CidrIp=${cidr}}]" >/dev/null
        fi
        echo "[cloudflare-ips]   :${port} - ${cidr}"
      done <<< "${to_remove}"
    fi
  done
fi

if [[ "${conf_changed}" == true && "${write}" == false ]] \
   || [[ "${sg_changed}" == true && "${apply_sg}" == false ]]; then
  echo "[cloudflare-ips] 변경이 필요합니다 (dry-run 이라 반영하지 않았습니다)."
  exit 2
fi
echo "[cloudflare-ips] 동기화 완료."
