# Task 81 -- SM Revision Prototype Pass

Owner: codex
Status: In Progress
Priority: P1

## Scope

Apply `docs/reference/handoff-sm-new-direction/0502-design-freeze-brief.md` to
the `handoff-sm-new-direction` candidate prototype without replacing existing
sections.

## Acceptance Criteria

- Existing `02~06` core sections remain intact.
- Same-number SM comparison sections are added under the relevant core module.
- Mobile designs are added before desktop work.
- Each mobile pass includes a grid/rule board that records state and interaction
  contracts before the later m-grid rewrite.
- `handoff-2026-04-25` remains unchanged.

## Progress Snapshot

- [x] Added `screens-sm-revision.jsx` for SM-only prototype boards.
- [x] Added `02 · 홈 · SM 수정안`.
- [x] Added `03 · 개인 매치 · SM 수정안`.
- [x] Added `04 · 팀 · 팀매칭 · SM 수정안`.
- [x] Added `05 · 팀 둘러보기 · SM 수정안`.
- [x] Added `06 · 커뮤니티 · 채팅 · 알림 · SM 수정안`.
- [x] Added `01 · 인증 · 로그인 · SM 수정안`.
- [x] Added `07 · 마이 · 프로필 · 리뷰 · SM 수정안`.
- [x] Added `08 · 결제 · 환불 · SM 수정안`.
- [x] Added `10 · 공개 · 랜딩 · SM 수정안`.
- [x] Added `12 · 관리자 · 운영 · SM 수정안`.
- [x] Promoted the SM bottom bar to `SMBottomNav` for SM revision and later
  mobile screens: `홈 / 매치 / 팀매치 / 팀 / 마이`.
- [x] Updated `prototype-system/MODULE_MAP.md` with the new comparison sections.
- [x] Updated `INDEX.md` with the Phase 2b SM design freeze note.
- [ ] Desktop-specific SM comparison sections.
- [ ] Browser visual QA for the rendered prototype.

## Ambiguity Log

- `05 · 팀 둘러보기` body requirements remain undefined in the SM source. The
  current board keeps shell and comparison/selection intent only.
- Home `my team` shortcut destination remains undecided in the SM source.
- Error copy `새로고침 필요합니다 필요` is preserved in the rules because the
  source note uses that exact phrase, but final product copy likely needs
  normalization.
