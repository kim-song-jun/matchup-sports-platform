#!/usr/bin/env bash
# deploy/backup-prod-db.sh 의 계약: 앱이 쓰는 DB(API 컨테이너의 DATABASE_URL)를 뜨고, 비밀번호를 docker 명령줄에
# 싣지 않으며, 덤프가 진짜일 때만 S3 에 올리고 하트비트를 낸다. 실패는 모두 비-0 종료 + 업로드·하트비트 없음.
# docker·aws 를 가짜로 바꿔 무엇이 어떤 인자로 불렸는지 기록해 단언한다.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT_DIR}/deploy/backup-prod-db.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }

PASSWORD_RAW='p@ss/w0rd%x'
PASSWORD_URL='p%40ss%2Fw0rd%25x'
GOOD_TOC='215; 1259 16386 TABLE public _prisma_migrations teameet_v1
216; 1259 16390 TABLE public v1_users teameet_v1
3600; 0 16386 TABLE DATA public _prisma_migrations teameet_v1
3601; 0 16390 TABLE DATA public v1_users teameet_v1'

mkdir -p "${WORK}/bin"
# 가짜 docker: 인자를 기록하고, pg_dump 를 부를 때 넘겨받은 --env-file 내용을 복사해 둔다.
cat > "${WORK}/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${FAKE_DIR}/docker.argv"
case "$1" in
  inspect) printf 'PATH=/usr/bin\nDATABASE_URL=%s\nNODE_ENV=production\n' "${FAKE_DATABASE_URL}" ;;
  run)
    env_file=''
    prev=''
    for arg in "$@"; do
      [[ "${prev}" != --env-file ]] || env_file="${arg}"
      prev="${arg}"
    done
    case "$*" in
      *' pg_dump '*)
        [[ -z "${env_file}" ]] || cp "${env_file}" "${FAKE_DIR}/pg.env"
        [[ "${FAKE_DUMP_FAILS:-false}" != true ]] || exit 1
        head -c "${FAKE_DUMP_BYTES}" /dev/zero ;;
      *' pg_restore --list'*) cat > /dev/null; printf '%s\n' "${FAKE_TOC}" ;;
      *) exit 99 ;;
    esac ;;
  *) exit 98 ;;
esac
EOF
cat > "${WORK}/bin/aws" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in
  's3 cp') [[ "${FAKE_S3_FAILS:-false}" != true ]] || exit 1; printf '%s\n' "$4" >> "${FAKE_DIR}/uploads" ;;
  'cloudwatch put-metric-data') printf '%s\n' "$*" >> "${FAKE_DIR}/heartbeats" ;;
  *) exit 97 ;;
esac
EOF
chmod +x "${WORK}/bin/docker" "${WORK}/bin/aws"

# run_case <이름> [VAR=값 …] — 한 번 실행하고 종료 코드를 CASE_RC 에, 기록을 CASE_DIR 에 남긴다.
run_case() {
  local name="$1"
  shift
  CASE_DIR="${WORK}/${name}"
  mkdir -p "${CASE_DIR}/tmp"
  : > "${CASE_DIR}/uploads"
  : > "${CASE_DIR}/heartbeats"
  env PATH="${WORK}/bin:${PATH}" TMPDIR="${CASE_DIR}/tmp" FAKE_DIR="${CASE_DIR}" BACKUP_DOCKER_CMD=docker BACKUP_BUCKET=test-bucket \
    FAKE_DATABASE_URL="postgresql://teameet_v1:${PASSWORD_URL}@db.example.internal:5432/teameet_v1" \
    FAKE_DUMP_BYTES=4096 FAKE_TOC="${GOOD_TOC}" "$@" bash "${SCRIPT}" > "${CASE_DIR}/out" 2>&1 && CASE_RC=0 || CASE_RC=$?
}
count() { wc -l < "$1" | tr -d ' '; }
expect_refused() {
  local label="$1"
  if [[ "${CASE_RC}" -ne 0 && "$(count "${CASE_DIR}/uploads")" == 0 && "$(count "${CASE_DIR}/heartbeats")" == 0 ]]; then
    pass "${label}"
  else
    fail "${label} (rc=${CASE_RC}, 업로드 $(count "${CASE_DIR}/uploads"), 하트비트 $(count "${CASE_DIR}/heartbeats"))"
    sed 's/^/        /' "${CASE_DIR}/out"
  fi
}

echo '[backup-prod-db] 정상'
run_case ok
if [[ "${CASE_RC}" -eq 0 && "$(count "${CASE_DIR}/heartbeats")" == 1 ]]; then pass '성공하면 하트비트 1번'; else
  fail "성공해야 한다 (rc=${CASE_RC})"; sed 's/^/        /' "${CASE_DIR}/out"; fi
if grep -qE '^s3://test-bucket/pg/daily/[0-9]{4}/[0-9]{2}/[0-9]{2}/teameet-v1-[0-9]{8}T[0-9]{6}Z\.dump$' "${CASE_DIR}/uploads"; then
  pass '일일 접두어 pg/daily/YYYY/MM/DD/ 에 올린다'; else fail "업로드 키: $(cat "${CASE_DIR}/uploads")"; fi
if grep -qxF "PGPASSWORD=${PASSWORD_RAW}" "${CASE_DIR}/pg.env" && grep -qx 'PGHOST=db.example.internal' "${CASE_DIR}/pg.env" \
  && grep -qx 'PGUSER=teameet_v1' "${CASE_DIR}/pg.env" && grep -qx 'PGDATABASE=teameet_v1' "${CASE_DIR}/pg.env" \
  && grep -qx 'PGOPTIONS=-c default_transaction_read_only=on' "${CASE_DIR}/pg.env"; then
  pass 'DATABASE_URL 을 풀어(%XX 포함) libpq 환경 파일로 넘기고 세션은 읽기 전용'; else fail 'libpq 환경 파일 내용'; cat "${CASE_DIR}/pg.env"; fi
if grep -qF -e "${PASSWORD_RAW}" -e "${PASSWORD_URL}" "${CASE_DIR}/docker.argv" "${CASE_DIR}/out"; then
  fail '비밀번호가 docker 명령줄이나 출력에 나왔다'; else pass '비밀번호는 docker 명령줄·출력에 없다'; fi
if [[ "$(grep -c -- '^run ' "${CASE_DIR}/docker.argv")" == "$(grep -c -- '^run .*--log-driver none' "${CASE_DIR}/docker.argv")" ]]; then
  pass '모든 docker run 이 로그 드라이버를 끈다(덤프가 컨테이너 로그로 쌓이지 않게)'; else fail 'log-driver none 이 빠진 docker run'; fi
if [[ -z "$(find "${CASE_DIR}/tmp" -mindepth 1 -print -quit)" ]]; then
  pass '임시 덤프·환경 파일을 남기지 않는다'; else fail "임시 파일이 남았다: $(find "${CASE_DIR}/tmp" -mindepth 1)"; fi

echo '[backup-prod-db] 거부'
run_case old-container FAKE_DATABASE_URL='postgresql://teameet_v1:x@v1_postgres:5432/teameet_v1'
expect_refused '운영 API 가 옛 DB 컨테이너(v1_postgres)를 가리키면 뜨지 않는다'
if grep -q ' pg_dump ' "${CASE_DIR}/docker.argv"; then fail '거부했는데 pg_dump 를 불렀다'; else pass '거부하면 pg_dump 도 부르지 않는다'; fi
if grep -q "운영 DB(RDS)가 아닌 'v1_postgres'" "${CASE_DIR}/out"; then pass '거부 이유가 로그에 남는다(env 파일로 새지 않는다)'; else
  fail '거부 이유가 로그에 없다'; sed 's/^/        /' "${CASE_DIR}/out"; fi
# 값 하나가 env 파일 한 줄이다 — 줄이 늘면 다른 PG* 값(예: PGHOST)을 덮어쓸 수 있다.
for case_ in 'newline-0a|x%0APGHOST%3Devil.example' 'newline-1digit|x%aPGHOST%3Devil.example' 'bad-percent|x%zz' 'percent-at-end|x%'; do
  run_case "${case_%%|*}" FAKE_DATABASE_URL="postgresql://teameet_v1:${case_#*|}@db.example.internal:5432/teameet_v1"
  expect_refused "비밀번호 '${case_#*|}' 처럼 줄바꿈으로 풀리거나 잘못된 %-인코딩이면 거부"
  if [[ -e "${CASE_DIR}/pg.env" ]]; then fail "'${case_#*|}' 인데 env 파일이 pg_dump 로 넘어갔다"; fi
done
run_case multi-line FAKE_DATABASE_URL=$'postgresql://teameet_v1:x@db.example.internal:5432/teameet_v1\nDATABASE_URL=postgresql://u:p@other.example/db'
expect_refused 'inspect 에서 DATABASE_URL 이 여러 줄로 나오면 거부'
run_case empty-host FAKE_DATABASE_URL='postgresql://teameet_v1:x@:5432/teameet_v1'
expect_refused 'DATABASE_URL 호스트가 비면 실패'
run_case no-url FAKE_DATABASE_URL=''
expect_refused 'API 컨테이너에 DATABASE_URL 이 없으면 실패'
run_case dump-fails FAKE_DUMP_FAILS=true
expect_refused 'pg_dump 가 실패하면 실패'
run_case small FAKE_DUMP_BYTES=10
expect_refused '덤프가 MIN_DUMP_BYTES 보다 작으면 올리지 않는다'
run_case no-ledger FAKE_TOC="$(grep -v _prisma_migrations <<< "${GOOD_TOC}")"
expect_refused '목차에 _prisma_migrations 가 없으면(앱 DB 가 아니면) 올리지 않는다'
run_case no-data FAKE_TOC="$(grep -v 'TABLE DATA' <<< "${GOOD_TOC}")"
expect_refused '목차에 데이터 항목이 없으면 올리지 않는다'
run_case s3-fails FAKE_S3_FAILS=true
expect_refused 'S3 업로드가 실패하면 하트비트를 내지 않는다'
run_case no-bucket BACKUP_BUCKET=
expect_refused 'BACKUP_BUCKET 이 없으면 시작하지 않는다'

echo '[backup-prod-db] source 하면 함수만 정의한다'
if out="$(env PATH="${WORK}/bin:${PATH}" FAKE_DIR="${WORK}" bash -c ". '${SCRIPT}' && declare -F prod_db_client >/dev/null && echo defined")" \
  && [[ "${out}" == defined && ! -s "${WORK}/docker.argv" ]]; then
  pass 'source 는 백업을 돌리지 않는다'; else fail 'source 가 백업을 돌렸거나 함수가 없다'; fi

if (( failures > 0 )); then
  echo "[backup-prod-db] ${failures} failed"
  exit 1
fi
echo '[backup-prod-db] passed'
