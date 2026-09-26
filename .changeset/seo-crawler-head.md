---
"v1_web": patch
---

AI·검색 크롤러가 처음 여는 페이지에서도 제목·대표 주소·공유 정보·구조화 데이터를 `<head>` 에서 바로 받도록 했어요.

지금까지는 캐시가 비어 있는 상세 페이지를 크롤러가 처음 열면, 이 정보가 본문 끝 스크립트로만 와서 JS 를 돌리지 않는 AI 크롤러에게는 빈 `<head>` 로 보였습니다. robots.txt 가 허용한 AI 크롤러와 네이버 Yeti, 그리고 Googlebot·Bingbot·다음 크롤러를 Next 의 `htmlLimitedBots` 에 올렸어요. 크롤러 명단은 한 파일(`src/lib/crawler-agents.ts`)에서 robots.txt 와 함께 읽어서, 한쪽만 고쳐 어긋나는 일이 생기지 않습니다.

네이버 서치어드바이저·구글 서치콘솔·빙 웹마스터 소유확인 메타를 `NAVER_SITE_VERIFICATION`·`GOOGLE_SITE_VERIFICATION`·`BING_SITE_VERIFICATION` 값으로 넣을 수 있게 했고(비우면 내보내지 않아요), 공지사항 RSS(`/notices/feed.xml`)를 새로 만들어 페이지 `<head>` 와 robots.txt 에 알렸습니다. 없는 주소 화면 두 곳(전역·대회 캠페인)에도 검색 제외 메타를 붙였어요.
