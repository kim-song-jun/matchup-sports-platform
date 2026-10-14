import { formatPhone } from '@/components/auth/signup-profile-validation';
import type { GameLineupParticipant } from '@/types/game-operations';

/**
 * 명단 검인(현장 본인 확인) 줄에 그리는 선수 이름·전화번호와 복사 문구를 한 곳에서 만든다.
 *
 * 실명·전화번호는 대회 운영진에게만 내려온다(`GameLineupParticipant.identity`). 값이 없는 쪽(팀 매니저 등)은
 * 키 자체가 없어서 이 모듈의 함수가 전부 "닉네임만"으로 돌아간다 — 화면이 권한을 따로 판단하지 않는다.
 */

/** 줄의 이름 — 실명이 있으면 `실명 (닉네임)`, 없으면 닉네임 그대로. */
export function participantIdentityName(participant: Pick<GameLineupParticipant, 'displayNameSnapshot' | 'identity'>): string {
  const realName = participant.identity?.realName?.trim();
  return realName ? `${realName} (${participant.displayNameSnapshot})` : participant.displayNameSnapshot;
}

/** 줄에 붙는 전화번호(`010-1234-5678`). 없으면 null. */
export function participantIdentityPhone(participant: Pick<GameLineupParticipant, 'identity'>): string | null {
  const phone = participant.identity?.phone?.trim();
  return phone ? formatPhone(phone) : null;
}

/**
 * 복사 문구 — 탭으로 구분한 `실명 ⇥ 닉네임 ⇥ 전화번호`. 엑셀·구글 시트에 붙이면 세 칸으로 나뉜다.
 * 값이 없는 칸은 비워 두어(칸 수는 유지) 여러 줄을 이어 붙여도 열이 어긋나지 않는다.
 * 복사할 값이 하나도 없으면(계정 없는 참가자·탈퇴 회원) null — 호출부가 버튼을 그리지 않는다.
 */
export function participantIdentityCopyText(
  participant: Pick<GameLineupParticipant, 'displayNameSnapshot' | 'identity'>,
): string | null {
  if (!participant.identity) return null;
  const realName = participant.identity.realName?.trim() ?? '';
  const phone = participantIdentityPhone(participant) ?? '';
  if (!realName && !phone) return null;
  return [realName, participant.displayNameSnapshot, phone].join('\t');
}
