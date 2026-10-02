import { describe, expect, it } from 'vitest';
import {
  formatRosterBirthDate,
  getMemberIneligibility,
  getRegistrationDeadlineState,
  isTournamentRosterMutable,
  normalizeBirthDateForInput,
  tournamentRosterClosedMessage,
  normalizeProfileText,
} from './tournament-roster-client';

describe('tournament roster profile/date helpers', () => {
  it('normalizes team member profile fields before registerability checks use them', () => {
    expect(normalizeProfileText('  홍길동  ')).toBe('홍길동');
    expect(normalizeProfileText(null)).toBe('');
    expect(normalizeBirthDateForInput('19950315')).toBe('1995-03-15');
    expect(normalizeBirthDateForInput('1995.3.5')).toBe('1995-03-05');
    expect(normalizeBirthDateForInput('1995-03-15T00:00:00.000Z')).toBe('1995-03-15');
  });

  it('does not render invalid birthDateSnapshot values as NaN.NaN.NaN', () => {
    expect(formatRosterBirthDate('1995-03-15')).toBe('1995.03.15');
    expect(formatRosterBirthDate('19950315')).toBe('1995.03.15');
    expect(formatRosterBirthDate('not-a-date')).toBe('미입력');
    expect(formatRosterBirthDate(null)).toBe('미입력');
  });

  it('classifies registration deadlines independently from roster lock state', () => {
    const now = new Date('2026-07-20T12:00:00Z').getTime();

    expect(getRegistrationDeadlineState('2026-07-20T13:00:00Z', now)).toBe('upcoming');
    expect(getRegistrationDeadlineState('2026-07-20T11:00:00Z', now)).toBe('closed');
    expect(getRegistrationDeadlineState(null, now)).toBe('unscheduled');
    expect(getRegistrationDeadlineState('invalid', now)).toBe('unscheduled');
  });
});

// 감사 finding #1: 이 화면이 대회 status를 전혀 안 봐서, 완료·취소된 대회에서도 '수정
// 가능' 배지가 그대로 떠 있다가 서버가 409 TOURNAMENT_ROSTER_NOT_MUTABLE로 거절했다.
// 서버 isRosterMutableTournament(roster-cleanup.ts)와 같은 규칙을 여기서도 지킨다.
describe('isTournamentRosterMutable', () => {
  it('treats open/closed/in_progress tournaments as roster-mutable', () => {
    for (const status of ['open', 'closed', 'in_progress']) {
      expect(isTournamentRosterMutable({ status, kind: 'regular_tournament' })).toBe(true);
    }
  });

  it('treats completed/cancelled competitions as roster-immutable, league or not', () => {
    for (const status of ['completed', 'cancelled']) {
      expect(isTournamentRosterMutable({ status, kind: 'regular_tournament' })).toBe(false);
      expect(isTournamentRosterMutable({ status, kind: 'regular_league' })).toBe(false);
    }
  });

  // Task 170: 리그는 초안에서 신청이 확정되고 명단도 그때 받는다. 대회 초안은 신청이 없어 막힌 채다.
  it('lets a draft regular league take a roster but not a draft tournament', () => {
    expect(isTournamentRosterMutable({ status: 'draft', kind: 'regular_league' })).toBe(true);
    expect(isTournamentRosterMutable({ status: 'draft', kind: 'regular_tournament' })).toBe(false);
    expect(isTournamentRosterMutable({ status: 'draft', kind: null })).toBe(false);
  });

  it('does not block while the tournament is still loading (status undefined)', () => {
    expect(isTournamentRosterMutable(undefined)).toBe(true);
    expect(isTournamentRosterMutable(null)).toBe(true);
    expect(isTournamentRosterMutable({ status: undefined, kind: null })).toBe(true);
  });
});

describe('tournamentRosterClosedMessage', () => {
  it('only says "ended or cancelled" when the competition actually ended or was cancelled', () => {
    expect(tournamentRosterClosedMessage('completed')).toContain('종료되었거나 취소돼');
    expect(tournamentRosterClosedMessage('cancelled')).toContain('종료되었거나 취소돼');
    expect(tournamentRosterClosedMessage('draft')).toBe('대회가 아직 공개되지 않아 선수 명단을 수정할 수 없어요.');
  });

  it('calls a regular league a league, and leaves tournaments and unfilled kinds as "대회"', () => {
    expect(tournamentRosterClosedMessage('completed', 'regular_league')).toBe(
      '리그가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요.',
    );
    expect(tournamentRosterClosedMessage('cancelled', 'regular_league')).toContain('리그가');
    expect(tournamentRosterClosedMessage('completed', 'regular_tournament')).toContain('대회가 종료되었거나');
    expect(tournamentRosterClosedMessage('completed', null)).toContain('대회가 종료되었거나');
  });

  // 시즌이 남은 completed 는 "진행 중인데 종료?" 로 읽힌다 — 서버가 모든 경기 확정 시 자동 전이한 것이므로 그 이유를 말한다.
  describe('시즌 종료일이 아직 오지 않은 completed 리그', () => {
    const REASON = '모든 경기 결과가 확정돼 리그가 종료 처리됐어요. 더 이상 선수 명단을 수정할 수 없어요.';
    const seasonEnd = '2026-11-30T14:59:59.999Z';
    const before = new Date('2026-10-15T00:00:00+09:00').getTime();
    const after = new Date('2026-12-01T00:00:00+09:00').getTime();

    it('이유를 말한다', () => {
      expect(tournamentRosterClosedMessage('completed', 'regular_league', seasonEnd, before)).toBe(REASON);
    });

    it('대조군: 시즌 종료일이 지났으면 기존 리그 문구 그대로다', () => {
      expect(tournamentRosterClosedMessage('completed', 'regular_league', seasonEnd, after)).toBe(
        '리그가 종료되었거나 취소돼 더 이상 선수 명단을 수정할 수 없어요.',
      );
    });

    it('대조군: 취소된 리그·종료일 모르는 리그·대회는 이유 문구를 쓰지 않는다', () => {
      expect(tournamentRosterClosedMessage('cancelled', 'regular_league', seasonEnd, before)).toContain('리그가 종료되었거나 취소돼');
      expect(tournamentRosterClosedMessage('completed', 'regular_league', null, before)).toContain('리그가 종료되었거나 취소돼');
      expect(tournamentRosterClosedMessage('completed', 'regular_tournament', seasonEnd, before)).toContain('대회가 종료되었거나 취소돼');
    });
  });
});

// 감사 finding #49: 명단 추가 화면이 실명·생년월일·휴대폰만 보고 "선택 가능"으로 표시해,
// 여성부 대회의 남성 팀원·mixed 대회의 성별 미등록 팀원이 눌러 봐야 서버 400을 받았다.
// 서버 evaluateRosterCandidate(tournament-players.service.ts)와 같은 메시지로 미리 판정한다.
describe('getMemberIneligibility', () => {
  const completeMaleMember = { realName: '김선수', birthDate: '1995-03-15', phone: '01011112222', gender: 'male' as const };
  const completeFemaleMember = { ...completeMaleMember, gender: 'female' as const };

  it('allows a profile-complete member when the tournament has no gender restriction', () => {
    expect(getMemberIneligibility(completeMaleMember, null)).toBeNull();
  });

  it('blocks incomplete profiles with the same message the server uses', () => {
    const result = getMemberIneligibility({ realName: '', birthDate: '', phone: '', gender: null }, null);
    expect(result?.message).toBe('실명, 생년월일, 휴대폰 번호가 모두 등록된 팀원만 선수로 등록할 수 있어요.');
  });

  it('blocks a male member in a female-only tournament', () => {
    const result = getMemberIneligibility(completeMaleMember, 'female');
    expect(result?.message).toBe('여성부 대회에는 여성 팀원만 등록할 수 있어요.');
  });

  it('allows a female member in a female-only tournament', () => {
    expect(getMemberIneligibility(completeFemaleMember, 'female')).toBeNull();
  });

  it('blocks a mixed-tournament member with no gender on file, even with a complete profile otherwise', () => {
    const result = getMemberIneligibility({ ...completeMaleMember, gender: null }, 'mixed');
    expect(result?.message).toBe('실명, 생년월일, 휴대폰 번호, 성별이 모두 등록된 팀원만 선수로 등록할 수 있어요.');
  });

  it('allows a mixed-tournament member with any gender on file', () => {
    expect(getMemberIneligibility(completeMaleMember, 'mixed')).toBeNull();
    expect(getMemberIneligibility(completeFemaleMember, 'mixed')).toBeNull();
  });
});
