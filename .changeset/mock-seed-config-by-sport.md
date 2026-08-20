---
"v1_api": patch
---

목업 대회가 종목과 무관한 대회 설정(config)을 박던 문제 수정. alpha 에는 ACTIVE config 가 5개
있고 종목마다 라인업 하한이 다른데(풋살 3명·축구 7명) `createdAt` 최신 것을 집고 있었다. 대회
종목(`sportCode`)에 맞는 ACTIVE config 를 고르도록 바꾸고, 어드민 패널의 "선발 최소 인원" 안내도
같은 종목 기준으로 계산한다.
