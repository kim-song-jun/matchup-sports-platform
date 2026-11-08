import { describe, expect, it } from 'vitest';
import { teamScheduleCancelReasonLabel } from './v1-status-labels';

// 서버가 팀 일정을 스스로 취소할 때 `V1TeamSchedule.cancelReason` 에 남기는 코드 전부.
// 새 코드가 서버에 생기면 아래 목록과 `TEAM_SCHEDULE_CANCEL_REASON_LABEL` 에 함께 넣는다.
const SERVER_CANCEL_REASON_CODES = [
  'BRACKET_TEAM_CHANGED', // tournaments/tournament-match-update.ts
  'BRACKET_SCHEDULE_REMOVED', // tournaments/tournament-match-update.ts
  'BRACKET_SOURCE_REVERSED', // game-operations/tournament-team-match-advancement.ts
  'LEAGUE_SLOT_TEAM_CHANGED', // league-matches/league-fixture-side-assignment.ts
  'LEAGUE_SLOT_SIDE_INCOMPLETE', // league-matches/league-fixture-side-assignment.ts
  'no_opponent_auto_cancelled', // jobs/team-match-no-opponent
  'host_cancelled', // team-matches/team-matches.service.ts
  'host_deleted', // team-matches/team-matches.service.ts
  'admin_bracket_deleted_before_start', // tournaments/tournament-bracket-tx.ts
] as const;

const CODE_LIKE = /[A-Za-z]+_[A-Za-z_]+/;

describe('teamScheduleCancelReasonLabel', () => {
  it.each(SERVER_CANCEL_REASON_CODES)('서버 코드 %s 는 해요체 문장으로 바뀌고 코드 글자는 남지 않는다', (code) => {
    const label = teamScheduleCancelReasonLabel(code);

    expect(label).not.toBeNull();
    expect(label).toMatch(/요\.$/);
    expect(label).not.toMatch(CODE_LIKE);
    expect(label).not.toBe(teamScheduleCancelReasonLabel('SOME_UNMAPPED_CODE'));
  });

  it('코드마다 서로 다른 문장이다 — 두 코드가 같은 말로 뭉개지지 않는다', () => {
    const labels = SERVER_CANCEL_REASON_CODES.map((code) => teamScheduleCancelReasonLabel(code));

    expect(new Set(labels).size).toBe(SERVER_CANCEL_REASON_CODES.length);
  });

  it('팀장·매니저가 직접 적은 사유는 그대로 보인다(앞뒤 공백만 정리)', () => {
    expect(teamScheduleCancelReasonLabel('우천으로 취소')).toBe('우천으로 취소');
    expect(teamScheduleCancelReasonLabel('  구장 사정으로 이번 주는 쉬어요  ')).toBe('구장 사정으로 이번 주는 쉬어요');
    expect(teamScheduleCancelReasonLabel('리그 참가팀에서 제외돼 자동으로 취소했어요.')).toBe('리그 참가팀에서 제외돼 자동으로 취소했어요.');
  });

  it('영어로 적은 일반 문장은 코드로 오인하지 않는다', () => {
    expect(teamScheduleCancelReasonLabel('Cancelled due to rain')).toBe('Cancelled due to rain');
    expect(teamScheduleCancelReasonLabel('Rain')).toBe('Rain');
  });

  it('모르는 코드는 원문을 보이지 않고 일반 문구로 바꾼다', () => {
    const generic = teamScheduleCancelReasonLabel('FUTURE_SERVER_REASON');

    expect(generic).toBe('일정이 조정됐어요.');
    expect(teamScheduleCancelReasonLabel('some_snake_case_reason')).toBe(generic);
    expect(teamScheduleCancelReasonLabel('host_cancelled_from_detail')).toBe(generic);
  });

  it('Object 기본 속성 이름은 코드 표가 아니라 사용자 글로 다룬다', () => {
    expect(teamScheduleCancelReasonLabel('constructor')).toBe('constructor');
    expect(teamScheduleCancelReasonLabel('toString')).toBe('toString');
  });

  it('사유가 없거나 공백뿐이면 null 이라 호출하는 화면이 줄을 그리지 않는다', () => {
    expect(teamScheduleCancelReasonLabel(null)).toBeNull();
    expect(teamScheduleCancelReasonLabel(undefined)).toBeNull();
    expect(teamScheduleCancelReasonLabel('')).toBeNull();
    expect(teamScheduleCancelReasonLabel('   ')).toBeNull();
  });
});
