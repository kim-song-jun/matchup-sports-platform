# 친선 팀매치 화면 흐름과 기록 계약

## 범위

이 문서는 v1 `team-matches`의 친선 팀매치만 다룬다. 개인 친선 매치, 정규 리그, 대회 경기는 범위에서 제외한다. 캡처는 실제 v1 API로 팀 생성, 매치 신청·승인, 출전 명단 제출, 결과 입력·상대 승인, 공식 전적 프로젝션까지 완료한 데이터로 만들었다.

## 전체 흐름

`팀매치 탐색 → 6단계 매치 등록 → 신청/승인 → 매칭 완료 → 출전 명단 → 결과 입력 → 상대팀 결과 승인 → 공식 결과 → 팀 전적 / 개인 기록`

채팅 진입은 상세 화면의 보조 동선이며 공용 채팅 도메인의 별도 화면이므로 이번 캡처 묶음에서는 제외했다.

## 화면별 입력과 표시 정보

| 단계 | 경로 | 사용자가 입력·선택하는 정보 | 화면에 표시되는 정보 |
| --- | --- | --- | --- |
| 팀매치 탐색 | `/team-matches` | 검색어, 종목, 지역, 실력대 필터 | 모집 카드의 주최팀, 제목, 종목, 일시, 장소, 비용, 모집 상태와 새 매치 등록 CTA |
| 팀 선택 | `/team-matches/new/team` | 내가 운영하거나 관리하는 팀 | 팀명, 역할, 멤버 수, 주 종목과 선택 상태 |
| 종목 확인 | `/team-matches/new/sport` | 선택 팀이 지원하는 종목 | 선택 팀과 종목 요약 |
| 기본 정보 | `/team-matches/new/info` | 제목(필수), 설명, 대표 이미지 | 입력값 미리보기와 단계 진행 상태 |
| 경기 조건 | `/team-matches/new/condition` | 실력대, 경기 방식, 플레이 스타일 최대 3개, 유니폼 색, 성별, 총 비용과 상대 부담금 | 선택된 조건과 비용 분담 요약 |
| 장소·시간 | `/team-matches/new/place-time` | 지역, 경기장(필수), 주소, 경기일·시작 시간(필수), 종료 시간, 신청 마감 | 일정과 장소 요약 |
| 최종 확인 | `/team-matches/new/confirm` | 앞 단계 수정 또는 등록 확정 | 팀, 종목, 소개, 조건, 장소·시간, 비용 전체 요약 |
| 주최 상세 | `/team-matches/:id` | 신청 승인·거절, 수정, 관리, 채팅 진입 | 양 팀, 모집/매칭 상태, 일시, 장소, 지역, 종목, 실력대, 방식, 스타일, 유니폼, 성별, 비용, 설명 |
| 매치 수정 | `/team-matches/:id/edit` | 제목, 설명, 이미지, 조건, 장소·시간 변경 또는 취소 | 현재 매치 값. 주최 팀과 종목은 생성 후 고정 |
| 매칭 완료 상세 | `/team-matches/:id` | 명단·결과 입력 진입 | 확정된 상대팀과 후속 진행 CTA |
| 출전 명단 | `/team-matches/:id/lineup` | 팀원/게스트 선택, 골키퍼, 등번호, 프리셋 불러오기, 저장·제출·변경 요청 | 최신 명단 리비전과 제출 상태. 게스트는 팀 경기에는 남지만 개인 사용자 기록에는 연결되지 않음 |
| 결과 입력 | `/team-matches/:id/result` | 홈·원정 점수, 출전 선수, 홈 득점 수만큼의 득점자, 옐로·레드카드, MVP, 메모 | 입력 검토 요약과 제출 후 수정 제한 안내 |
| 결과 승인 | `/team-matches/:id/result/approval` | 상대팀 승인 또는 정정 사유 입력 | 제출 점수, 참가자 통계, 카드, MVP, 결과 리비전 상태 |
| 공식 결과 | `/team-matches/:id/result` | 후속 조회 | 공식 점수, 참가자, 득점·카드·MVP와 공식 확정 상태 |
| 팀 전적 | `/teams/:id/records` | 전체/대회/리그/친선 탭, 시즌 | 경기 수, 승·무·패, 득·실점과 경기별 상대·스코어·이벤트 |
| 개인 기록 | `/users/:id/records` | 전체/대회/리그/친선 탭 | 출전, 골, 도움, 카드, MVP와 경기별 팀·상대·결과. 본인은 동의 전에도 조회할 수 있고 타인 공개는 기록 공개 동의가 필요 |

## 공식 기록이 남는 방식

- 상대팀이 결과를 승인하면 결과 리비전이 `OFFICIAL`이 되고 게임은 `ENDED`가 된다.
- 게임 운영 워커가 `GAME_RESULT_OFFICIAL` outbox를 처리해 양 팀의 공식 전적 fact를 만든다. 따라서 승인 직후 화면은 프로젝션 완료까지 짧은 지연이 있을 수 있다.
- 친선 팀매치는 HOME/AWAY 각각의 최신 유효 출전 명단을 기준으로 결과 참가자를 보강한다. 화면에서 보낸 득점·도움·카드 값은 우선하며, 누락된 실제 출전자는 0 통계와 골키퍼 스냅샷으로 추가된다.
- 사용자 ID가 연결된 출전자는 개인 기록에 출전·득점·도움·카드·MVP가 남는다. 게스트 선수는 팀 전적에는 포함되지만 개인 사용자 기록은 만들지 않는다.
- 팀 전적 점수 공개는 게임 visibility와 `PUBLIC_LIVE` 운영 플래그를 따른다. 플래그가 꺼지면 `LIVE` 정책은 상태만 보이도록 강등된다.
- 이 보강 로직은 친선 팀매치에만 적용하며 리그·대회 결과 경로는 변경하지 않는다.

## 화면 캡처

모든 화면을 모바일 `390×844`, 데스크톱 `1440×900`에서 캡처했다.

| 화면 | 모바일 | 데스크톱 |
| --- | --- | --- |
| 팀매치 탐색 | [mobile](../screenshots/friendly-team-match-flow/list/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/list/desktop.png) |
| 팀 선택 | [mobile](../screenshots/friendly-team-match-flow/create-team/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/create-team/desktop.png) |
| 종목 확인 | [mobile](../screenshots/friendly-team-match-flow/create-sport/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/create-sport/desktop.png) |
| 기본 정보 | [mobile](../screenshots/friendly-team-match-flow/create-info/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/create-info/desktop.png) |
| 경기 조건 | [mobile](../screenshots/friendly-team-match-flow/create-condition/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/create-condition/desktop.png) |
| 장소·시간 | [mobile](../screenshots/friendly-team-match-flow/create-place-time/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/create-place-time/desktop.png) |
| 최종 확인 | [mobile](../screenshots/friendly-team-match-flow/create-confirm/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/create-confirm/desktop.png) |
| 주최 상세 | [mobile](../screenshots/friendly-team-match-flow/host-detail/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/host-detail/desktop.png) |
| 매치 수정 | [mobile](../screenshots/friendly-team-match-flow/edit/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/edit/desktop.png) |
| 매칭 완료 상세 | [mobile](../screenshots/friendly-team-match-flow/matched-detail/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/matched-detail/desktop.png) |
| 출전 명단 | [mobile](../screenshots/friendly-team-match-flow/lineup/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/lineup/desktop.png) |
| 결과 입력 | [mobile](../screenshots/friendly-team-match-flow/result-entry/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/result-entry/desktop.png) |
| 결과 승인 | [mobile](../screenshots/friendly-team-match-flow/result-approval/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/result-approval/desktop.png) |
| 공식 결과 | [mobile](../screenshots/friendly-team-match-flow/official-result/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/official-result/desktop.png) |
| 팀 친선 전적 | [mobile](../screenshots/friendly-team-match-flow/team-records/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/team-records/desktop.png) |
| 사용자 친선 기록 | [mobile](../screenshots/friendly-team-match-flow/user-records/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/user-records/desktop.png) |
| 팀 전적 `친선` 탭 선택 | [mobile](../screenshots/friendly-team-match-flow/team-records-friendly/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/team-records-friendly/desktop.png) |
| 사용자 기록 `친선` 탭 선택 | [mobile](../screenshots/friendly-team-match-flow/user-records-friendly/mobile.png) | [desktop](../screenshots/friendly-team-match-flow/user-records-friendly/desktop.png) |

원본 캡처 메타데이터는 [manifest.json](../screenshots/friendly-team-match-flow/manifest.json)에 있다.

## `친선` 탭 클릭 확인

- 팀 전적과 사용자 기록 모두 `친선` 탭이 `aria-selected=true`로 전환된다.
- 두 화면 모두 `/records?type=friendly` API를 새로 요청하며, 응답 목록은 `type=friendly`만 포함한다.
- 캡처에 사용한 현재 경기 `gameId`가 팀·사용자 친선 목록 양쪽에 포함된다.
- 팀 KPI는 친선 기준 경기·승무패·득실차로, 사용자 KPI는 친선 기준 엔트리·골로 바뀐다.
- 사용자 본인 화면에서는 기록 공개 동의 전이라는 안내 배너가 탭 전환 후에도 유지된다.

## QA 결과

- 18개 상태 × 2개 viewport = 36개 응답 모두 HTTP 200.
- 브라우저 page error 0건.
- 캡처용 현재 매치가 팀·사용자 기록 양쪽에 같은 `gameId`로 반영된 것을 확인했다. 한 경기 기여분은 `1승, 2득점 1실점 / 사용자 1경기 1골`이며, 최종 캡처의 누적 QA 데이터는 세 번의 동일 시나리오 실행으로 `3승, 6득점 3실점 / 사용자 3경기 3골`이다.
- 기존 React 경고인 `AppShellFrame` 렌더 중 `useShellOverride` 상태 갱신 경고가 탐색·상세·전적 화면에서 남아 있다. 캡처 실패나 데이터 누락은 아니지만 후속 UI 정리 대상으로 기록한다.
