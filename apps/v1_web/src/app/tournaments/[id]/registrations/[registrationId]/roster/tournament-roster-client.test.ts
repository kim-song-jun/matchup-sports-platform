import { describe, expect, it } from 'vitest';
import {
  formatRosterBirthDate,
  getMemberIneligibility,
  getRegistrationDeadlineState,
  isTournamentRosterMutable,
  normalizeBirthDateForInput,
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
// 서버 ROSTER_MUTABLE_TOURNAMENT_STATUSES(roster-cleanup.ts)와 같은 집합을 여기서도 지킨다.
describe('isTournamentRosterMutable', () => {
  it('treats open/closed/in_progress tournaments as roster-mutable', () => {
    expect(isTournamentRosterMutable('open')).toBe(true);
    expect(isTournamentRosterMutable('closed')).toBe(true);
    expect(isTournamentRosterMutable('in_progress')).toBe(true);
  });

  it('treats completed/cancelled tournaments as roster-immutable', () => {
    expect(isTournamentRosterMutable('completed')).toBe(false);
    expect(isTournamentRosterMutable('cancelled')).toBe(false);
  });

  it('does not block while the tournament is still loading (status undefined)', () => {
    expect(isTournamentRosterMutable(undefined)).toBe(true);
    expect(isTournamentRosterMutable(null)).toBe(true);
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
