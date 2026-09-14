---
"v1_api": patch
---

Task 168 StageB 디스패치가 "이전 릴리스 조회" 단계에서 멈추던 문제를 고쳤어요. 이 단계는
`scripts/release/read-task168-stage-a-predecessor.sh`를 SSM으로 호스트의 맨 셸에서 실행하는데,
스크립트가 배포 흐름 안에서만 성립하는 가정을 두 개 갖고 있었어요.

- DB 계정을 컴파일된 기본값(`teameet_v1`)으로 접속했어요. 그 셸에는 운영 env 파일이 들어오지
  않아 기본값이 그대로 쓰였고, alpha DB는 그 역할을 갖고 있지 않아 `role does not exist`로
  죽었어요. 이제 실행 중인 postgres 컨테이너의 환경에서 역할·DB 이름을 읽어요 —
  `task168-stage-b-migrate.sh`가 이미 쓰는 방식이라, 매니페스트에 기록되는 DB 신원과 러너가
  실행 시점에 다시 계산하는 값이 정의상 같아져요.
- 컨테이너를 `docker compose`로 찾았어요. compose는 서브커맨드 전에 모델 전체를 해석하는데
  alpha compose 파일은 `deploy-alpha.sh`만 내보내는 이미지 변수를 요구해서, 그 셸에서는 모든
  compose 호출이 실패했어요. 이제 compose 라벨로 컨테이너를 직접 지목해요.

psql 호출에서 `-i`도 뺐어요. 이 스크립트는 `bash -s`로 파이프돼 들어가기 때문에 stdin을 붙잡는
자식이 아직 읽히지 않은 스크립트 나머지를 삼켜, 첫 쿼리만 실행되고 나머지가 조용히 사라졌어요.

두 결함 모두 fail-closed였어요 — DB는 전혀 변경되지 않았고 M11은 실행된 적이 없어요. 고친
바이트 그대로를 실제 alpha 호스트에서 읽기 전용으로 실행해 StageA 영수증의 DB 신원과 일치함을
확인했고, 실제 스크립트를 가짜 docker로 돌리는 계약 테스트(13건)를 CI에 배선했어요.
