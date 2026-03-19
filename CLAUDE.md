# MatchUp - AI 기반 멀티스포츠 소셜 매칭 플랫폼

## 프로젝트 개요
풋살/농구/아이스하키/배드민턴 등 생활체육 종목의 개인 및 팀을 AI로 최적 매칭하는 플랫폼.

## 기술 스택
- **모노레포**: pnpm workspaces + Turborepo
- **프론트엔드**: Next.js 15 (App Router) + Tailwind CSS v4
- **모바일**: Capacitor 6 (iOS/Android 래핑)
- **백엔드**: NestJS + TypeScript
- **DB**: PostgreSQL 16 + Redis 7
- **ORM**: Prisma
- **실시간**: Socket.IO (NestJS Gateway)
- **인증**: JWT + OAuth (카카오/네이버/애플)
- **결제**: 토스페이먼츠

## 디렉토리 구조
```
apps/web/     → Next.js 프론트엔드
apps/api/     → NestJS 백엔드
packages/shared/ → 공유 타입/상수
```

## 개발 명령어
```bash
pnpm dev          # 전체 개발 서버 (프론트 3000 + 백엔드 8000)
pnpm db:push      # Prisma 스키마 DB 반영
pnpm db:studio    # Prisma Studio (DB 브라우저)
docker compose up -d  # PostgreSQL + Redis 실행
```

## 코드 컨벤션
- 한국어 사용자 대상이므로 UI 텍스트는 한국어
- API 응답은 `{ status, data, timestamp }` 형태
- Cursor 기반 페이지네이션 사용
- API 경로: `/api/v1/*`
- 에러 코드: `DOMAIN_CODE` 형태 (e.g., MATCH_NOT_FOUND)

## 구현 문서 위치
구현 상세 문서는 별도 저장소에 있음. 주요 참조:
- 01_ARCHITECTURE: 시스템 아키텍처
- 02_DATABASE: DB 스키마 (Prisma 스키마로 변환 완료)
- 03_API_SPEC: API 엔드포인트
- 04_AI_MATCHING: 매칭 알고리즘
- 06_ICE_SPORTS: 빙상 스포츠 모듈
- 07_MARKETPLACE: 장터
- 08_PAYMENT: 결제 시스템
