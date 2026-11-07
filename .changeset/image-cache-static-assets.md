---
"v1_web": patch
---

이미지·고정 파일을 다시 받지 않게 했다. `/_next/image` 변환 결과를 배포 사이에 유지하는 `v1_web_image_cache` 볼륨(상한 256MB)을 붙였고, `public/` 고정 파일(글꼴·브랜드·일러스트 등)은 `no-store` 대신 `no-cache`(ETag 확인 후 304)로 보낸다. 선수 카드 브랜드 마크 마스크는 93KB PNG 대신 알파가 같은 10KB 무손실 WebP 를 쓴다.
