'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/v1-ui/primitives';
import { useV1CreateTeamContact, useV1MyTeams, useV1TeamDetail } from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorDetails, extractErrorMessage } from '@/lib/error-message';
import { isTeamOperatorRole, normalizeMyTeamsResponse } from '@/lib/team-role';

const MESSAGE_MAX_LENGTH = 500;

// 팀 컨택 도메인 에러 코드 → 사용자 메시지. code 로만 분기한다(문자열 매칭 금지 — error-message.ts 주석 지침).
const CONTACT_ERROR_MESSAGES: Record<string, string> = {
  TEAM_CONTACT_ALREADY_ACTIVE: '이미 이 팀과 진행 중인 컨택이 있어요.',
  TEAM_CONTACT_DAILY_LIMIT_EXCEEDED: '오늘 보낼 수 있는 컨택을 모두 사용했어요.',
};

type SubmitError = { message: string; href?: string };

/**
 * `TEAM_CONTACT_ALREADY_ACTIVE` 응답의 `details.existingChatRoomId` 를 방어적으로 꺼낸다.
 * 컨택은 곧 채팅방이므로 "진행 중인 컨택 보기" 는 그 방으로 간다.
 * extractErrorDetails 는 unknown 을 돌려주므로, error-message.ts 의 extractErrorCode 와
 * 같은 스타일로 — 느슨한 모양으로 캐스팅한 뒤 실제 값의 typeof 를 확인하고서만 쓴다.
 */
function extractExistingChatRoomId(details: unknown): string | undefined {
  const raw = (details as { existingChatRoomId?: unknown } | null | undefined)?.existingChatRoomId;
  return typeof raw === 'string' && raw ? raw : undefined;
}

export function TeamContactNewPageClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  const teamQuery = useV1TeamDetail(teamId);
  const myTeamsQuery = useV1MyTeams();
  const operatorTeams = useMemo(
    () => normalizeMyTeamsResponse(myTeamsQuery.data).filter((team) => isTeamOperatorRole(team.role)),
    [myTeamsQuery.data],
  );
  const [fromTeamId, setFromTeamId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<SubmitError | null>(null);
  const createContact = useV1CreateTeamContact(teamId);

  // 운영 권한 팀이 1개면 선택 UI 없이 그 팀으로 고정한다.
  const selectedFromTeamId = operatorTeams.length === 1 ? operatorTeams[0].teamId : fromTeamId;
  const trimmedMessage = message.trim();
  const canSubmit = Boolean(selectedFromTeamId) && trimmedMessage.length > 0 && !createContact.isPending;

  function handleSubmit() {
    if (!selectedFromTeamId || trimmedMessage.length === 0) return;
    setError(null);
    createContact.mutate(
      { fromTeamId: selectedFromTeamId, message: trimmedMessage },
      {
        onSuccess: (created) => {
          // 컨택 = 채팅방. 보낸 직후 그 방으로 간다.
          router.push(created.route);
        },
        onError: (err) => {
          const code = extractErrorCode(err);
          if (code === 'TEAM_CONTACT_ALREADY_ACTIVE') {
            const existingChatRoomId = extractExistingChatRoomId(extractErrorDetails(err));
            setError({
              message: CONTACT_ERROR_MESSAGES.TEAM_CONTACT_ALREADY_ACTIVE,
              href: existingChatRoomId ? `/chat/${existingChatRoomId}` : '/chat?category=team_contact',
            });
            return;
          }
          if (code && CONTACT_ERROR_MESSAGES[code]) {
            setError({ message: CONTACT_ERROR_MESSAGES[code] });
            return;
          }
          setError({ message: extractErrorMessage(err, '컨택을 보내지 못했어요. 잠시 후 다시 시도해 주세요.') });
        },
      },
    );
  }

  const targetTeamName = teamQuery.data?.name ?? '팀';

  return (
      <Card className="tm-content-enter" pad={20} style={{ marginTop: 12 }}>
        <div className="tm-text-heading">{targetTeamName}에 컨택 보내기</div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          팀 간 매치·교류를 제안하는 메시지를 보내요.
        </div>

        <form
          style={{ marginTop: 16, display: 'grid', gap: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          {operatorTeams.length >= 2 ? (
            <div>
              <label htmlFor="contact-from-team" className="tm-text-label">
                보내는 팀
              </label>
              <select
                id="contact-from-team"
                className="tm-input tm-input-select"
                style={{ marginTop: 8 }}
                value={fromTeamId}
                onChange={(event) => setFromTeamId(event.target.value)}
                disabled={createContact.isPending}
              >
                <option value="">팀을 선택해 주세요</option>
                {operatorTeams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label htmlFor="contact-message" className="tm-text-label">
              메시지
            </label>
            <textarea
              id="contact-message"
              className="tm-input"
              style={{ marginTop: 8, resize: 'none', lineHeight: 1.5 }}
              rows={5}
              maxLength={MESSAGE_MAX_LENGTH}
              value={message}
              placeholder="매치 제안이나 하고 싶은 이야기를 적어 주세요."
              onChange={(event) => setMessage(event.target.value)}
              disabled={createContact.isPending}
            />
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
              {message.length} / {MESSAGE_MAX_LENGTH}자
            </div>
          </div>

          {myTeamsQuery.isSuccess && operatorTeams.length === 0 ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              운영 권한이 있는 팀이 없어 컨택을 보낼 수 없어요.
            </div>
          ) : null}

          {error ? (
            <div role="status" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
              <div>{error.message}</div>
              {error.href ? (
                <Link
                  href={error.href}
                  className="tm-btn tm-btn-sm tm-btn-neutral"
                  style={{ marginTop: 8, display: 'inline-flex' }}
                >
                  진행 중인 컨택 보기
                </Link>
              ) : null}
            </div>
          ) : null}

          <button type="submit" className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={!canSubmit}>
            {createContact.isPending ? '보내는 중' : '컨택 보내기'}
          </button>
        </form>
      </Card>
  );
}
