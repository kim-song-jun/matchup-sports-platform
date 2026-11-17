# Minimal real-Prisma harness image for the Task 168 Stage B runner's local
# docker test harness (T4). This is NOT the production v1_api image — building
# that requires the full pnpm workspace. Per spec T4: "하네스 이미지는 저장소
# v1_api 빌드가 무거우면 prisma CLI 를 가진 최소 node 이미지 + 실제 migration
# 체인으로 구성해도 된다(명세 목적: 실제 SQL·실제 Prisma)." This image only
# needs the real `prisma` CLI (real schema-engine binary, real SQL execution)
# at /app/apps/v1_api/node_modules/.bin/prisma, running as a non-root `app`
# user matching the real runtime image's user/path layout so the runner
# script's docker exec/cp calls work unmodified.
FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /app/apps/v1_api
COPY package.json ./
RUN npm install --omit=dev
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
  && chown -R app:app /app
USER app
CMD ["sh", "-c", "sleep infinity"]
