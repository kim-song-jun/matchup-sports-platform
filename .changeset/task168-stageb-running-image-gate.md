---
"v1_api": patch
---

Task 168 StageB가 호스트에서 `currently running writer image does not match the authenticated Stage A
predecessor image`로 멈추던 문제를 고쳤어요.

StageB는 마이그레이션 직전에 "지금 돌고 있는 writer 이미지"를 확인하는데, 그 대조 대상이 **Stage A 시점의
이미지**였어요. 그 값은 Stage A 커토버가 남긴 영수증에 박제돼 있고 이후 배포로는 갱신되지 않아요. 그래서 이
검사는 사실상 **"Stage A 이후 어떤 배포도 있어선 안 된다"**를 요구했는데, Alpha는 dev에 머지될 때마다
재배포되니 StageB를 돌릴 수 있는 창이 사실상 없었어요.

이제 대조 대상은 **이 릴리스 자신의 Stage A 빌드**(`sha-<릴리스>` 이미지)예요. 매니페스트를 만들 때 ECR에서
digest로 확정해 `expectedRunningApiImage`로 박제하고, 러너는 실제로 돌고 있는 api·워커 이미지를 그것과
비교해요. 손으로 띄운 컨테이너나 알 수 없는 이미지는 여전히 거부되고, 실패 시 복구 경로는 원래대로 멈춘 그
컨테이너를 그대로 되살려요.

Stage A 영수증 자체의 인증(원장 경계·스키마·백업 증거)은 그대로예요. 대신 매니페스트를 만들 때 Stage A
커밋이 릴리스 커밋의 조상인지 확인해요 — 호스트에는 git 이력이 없어 거기선 확인할 수 없는 조건이에요.
