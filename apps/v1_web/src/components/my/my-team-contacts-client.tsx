'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ErrorState, ListItem } from '@/components/v1-ui/primitives';
import {
  useV1AcceptTeamContact,
  useV1DeclineTeamContact,
  useV1MyTeams,
  useV1ResolveChatRoom,
  useV1Team,
  useV1TeamContact,
  useV1TeamContacts,
  useV1WithdrawTeamContact,
} from '@/hooks/use-v1-api';
import type { V1TeamContact, V1TeamContactStatus } from '@/hooks/use-v1-api';
import { chatRoomHref } from '@/lib/chat-route';
import { formatTournamentDateTimeLong, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { isTeamOperatorRole, normalizeMyTeamsResponse } from '@/lib/team-role';

type Direction = 'inbound' | 'outbound';

const STATUS_LABEL: Record<V1TeamContactStatus, string> = {
  requested: '대기 중',
  accepted: '수락됨',
  declined: '거절됨',
  withdrawn: '철회함',
  expired: '만료됨',
};

const STATUS_BADGE_CLASS: Record<V1TeamContactStatus, string> = {
  requested: 'tm-badge-blue',
  accepted: 'tm-badge-green',
  declined: 'tm-badge-red',
  withdrawn: 'tm-badge-grey',
  expired: 'tm-badge-orange',
};

/**
 * `useV1MyTeams()` 응답은 배열이면서 `items`도 같이 들고 있는 하이브리드 형태다.
 * team-contact-new-client.tsx의 동일 헬퍼와 같은 관례(2곳 이상 중복은 이 저장소의
 * 기존 관행 — team-matches-create-client.tsx/teams-client.tsx도 각자 로컬 정의).
 */

function truncateMessage(message: string, max = 30) {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/** 컨택 만료까지 남은 시간을 계산한다 — 기존 date-utils 포맷터와 다른 "카운트다운" 값이라 로컬 계산. */
function formatExpiresIn(expiresAt: string): string {
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return '곧 만료돼요';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 후 만료돼요`;
  return `${minutes}분 후 만료돼요`;
}

export function MyTeamContactsListClient() {
  const myTeamsQuery = useV1MyTeams();
  const operatorTeams = useMemo(
    () => normalizeMyTeamsResponse(myTeamsQuery.data).filter((team) => isTeamOperatorRole(team.role)),
    [myTeamsQuery.data],
  );
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [direction, setDirection] = useState<Direction>('inbound');

  const effectiveTeamId = operatorTeams.length === 1 ? operatorTeams[0].teamId : selectedTeamId;
  const contactsQuery = useV1TeamContacts(effectiveTeamId, { direction, limit: 20 });
  const items = contactsQuery.data?.items ?? [];

  const noOperatorTeams = myTeamsQuery.isSuccess && operatorTeams.length === 0;

  return (
    <AppChrome title="팀 컨택함" activeTab="my" bottomNav={false} backHref="/my" desktopHead>
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">
          <div style={{ marginBottom: 14 }}>
            <div className="tm-text-heading">팀 컨택함</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>
              다른 팀과 주고받은 컨택 메시지를 확인해요.
            </div>
          </div>

          {operatorTeams.length >= 2 ? (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="team-contacts-team" className="tm-text-label">
                팀 선택
              </label>
              <select
                id="team-contacts-team"
                className="tm-input tm-input-select"
                style={{ marginTop: 6 }}
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
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

          {noOperatorTeams ? (
            <EmptyState
              title="운영 권한이 있는 팀이 없어요"
              sub="팀 오너·매니저만 컨택함을 확인할 수 있어요."
            />
          ) : !effectiveTeamId ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              팀을 선택하면 컨택 목록을 볼 수 있어요.
            </div>
          ) : (
            <>
              <div
                className="tm-seg-tabs"
                role="tablist"
                aria-label="컨택 방향"
                /* tm-review-tabs 는 3컬럼 고정이라 2탭에서는 오른쪽 1/3 이 빈다.
                   컬럼 수를 소비처가 정하는 tm-seg-tabs 를 쓴다(bracket-page-client 선례). */
                style={{ marginBottom: 14, gridTemplateColumns: '1fr 1fr' }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={direction === 'inbound'}
                  className="tm-seg-tab"
                  data-active={direction === 'inbound'}
                  onClick={() => setDirection('inbound')}
                >
                  받은 컨택
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={direction === 'outbound'}
                  className="tm-seg-tab"
                  data-active={direction === 'outbound'}
                  onClick={() => setDirection('outbound')}
                >
                  보낸 컨택
                </button>
              </div>

              {contactsQuery.isError ? (
                <ErrorState
                  message="컨택 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
                  onRetry={() => void contactsQuery.refetch()}
                />
              ) : contactsQuery.isLoading ? (
                /* 로딩을 빈 상태와 구분한다. 이 분기가 없으면 data 가 undefined 인 동안
                   items 가 [] 라서 "아직 컨택이 없어요" 가 먼저 떴다가 목록으로 바뀐다. */
                <Card pad={16}>
                  <div className="tm-text-body-lg">컨택 목록을 불러오는 중이에요.</div>
                </Card>
              ) : items.length === 0 ? (
                <EmptyState
                  title={direction === 'inbound' ? '아직 받은 컨택이 없어요' : '아직 보낸 컨택이 없어요'}
                  sub={
                    direction === 'inbound'
                      ? '다른 팀이 컨택을 보내면 여기서 확인할 수 있어요.'
                      : '다른 팀에 컨택을 보내면 여기서 확인할 수 있어요.'
                  }
                />
              ) : (
                <Card pad={0}>
                  {items.map((item) => (
                    <TeamContactListRow key={item.id} contact={item} direction={direction} />
                  ))}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </AppChrome>
  );
}

function TeamContactListRow({ contact, direction }: { contact: V1TeamContact; direction: Direction }) {
  const counterpartTeamId = direction === 'inbound' ? contact.fromTeamId : contact.toTeamId;
  const counterpartQuery = useV1Team(counterpartTeamId);
  const teamName = counterpartQuery.data?.name ?? '팀';
  const timeLabel = formatTournamentDateTimeShort(contact.createdAt) ?? '';

  return (
    <ListItem
      title={teamName}
      sub={`${truncateMessage(contact.message)} · ${timeLabel}`}
      trailing={
        <span className={`tm-badge ${STATUS_BADGE_CLASS[contact.status]}`}>{STATUS_LABEL[contact.status]}</span>
      }
      href={`/my/team-contacts/${contact.id}`}
      chev
    />
  );
}

export function MyTeamContactDetailClient({ contactId }: { contactId: string }) {
  const router = useRouter();
  const query = useV1TeamContact(contactId);
  const contact = query.data;

  const myTeamsQuery = useV1MyTeams();
  const operatorTeamIds = useMemo(
    () =>
      new Set(
        normalizeMyTeamsResponse(myTeamsQuery.data)
          .filter((team) => isTeamOperatorRole(team.role))
          .map((team) => team.teamId),
      ),
    [myTeamsQuery.data],
  );

  const fromTeamQuery = useV1Team(contact?.fromTeamId ?? '');
  const toTeamQuery = useV1Team(contact?.toTeamId ?? '');

  const acceptContact = useV1AcceptTeamContact(contactId);
  const declineContact = useV1DeclineTeamContact(contactId);
  const withdrawContact = useV1WithdrawTeamContact(contactId);
  const resolveChatRoom = useV1ResolveChatRoom();

  const [declineReason, setDeclineReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (query.isError) {
    return (
      <AppChrome title="컨택 상세" activeTab="my" bottomNav={false} backHref="/my/team-contacts" desktopHead>
        <div className="tm-my-shell">
          <ErrorState
            message="컨택 내용을 불러오지 못했어요. 권한이 없거나 삭제된 컨택일 수 있어요."
            onRetry={() => void query.refetch()}
          />
        </div>
      </AppChrome>
    );
  }

  if (!contact) {
    return (
      <AppChrome title="컨택 상세" activeTab="my" bottomNav={false} backHref="/my/team-contacts" desktopHead>
        <div className="tm-my-shell">
          <Card pad={16}>
            <div className="tm-text-body-lg">컨택 내용을 불러오는 중이에요.</div>
          </Card>
        </div>
      </AppChrome>
    );
  }

  const isRecipient = operatorTeamIds.has(contact.toTeamId);
  const isSender = operatorTeamIds.has(contact.fromTeamId);
  const fromTeamName = fromTeamQuery.data?.name ?? '팀';
  const toTeamName = toTeamQuery.data?.name ?? '팀';
  const actionsPending =
    acceptContact.isPending || declineContact.isPending || withdrawContact.isPending || resolveChatRoom.isPending;

  function handleAccept() {
    setActionError(null);
    acceptContact.mutate(undefined, {
      onError: (err) => setActionError(extractErrorMessage(err, '수락하지 못했어요. 잠시 후 다시 시도해 주세요.')),
    });
  }

  function handleDecline() {
    setActionError(null);
    const trimmedReason = declineReason.trim();
    declineContact.mutate(
      { reason: trimmedReason.length > 0 ? trimmedReason : undefined },
      {
        onError: (err) => setActionError(extractErrorMessage(err, '거절하지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  }

  function handleWithdraw() {
    setActionError(null);
    withdrawContact.mutate(undefined, {
      onError: (err) => setActionError(extractErrorMessage(err, '철회하지 못했어요. 잠시 후 다시 시도해 주세요.')),
    });
  }

  function handleOpenChat() {
    setActionError(null);
    resolveChatRoom.mutate(
      { targetType: 'team_contact', targetId: contactId },
      {
        onSuccess: (room) => router.push(chatRoomHref(room.roomId, room.route)),
        onError: (err) => setActionError(extractErrorMessage(err, '대화방을 열지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  }

  return (
    <AppChrome title="컨택 상세" activeTab="my" bottomNav={false} backHref="/my/team-contacts" desktopHead>
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop" style={{ display: 'grid', gap: 12 }}>
          <Card pad={16}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="tm-text-heading">
                  {fromTeamName} → {toTeamName}
                </div>
                <div className="tm-text-caption" style={{ marginTop: 6 }}>
                  {formatTournamentDateTimeLong(contact.createdAt)}
                </div>
              </div>
              <span className={`tm-badge ${STATUS_BADGE_CLASS[contact.status]}`}>
                {STATUS_LABEL[contact.status]}
              </span>
            </div>
            {contact.status === 'requested' ? (
              <div className="tm-text-caption" style={{ marginTop: 10, color: 'var(--text-muted)' }}>
                {formatExpiresIn(contact.expiresAt)}
              </div>
            ) : null}
          </Card>

          <Card pad={16}>
            <div className="tm-text-body-lg">전달 메시지</div>
            <p className="tm-text-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '10px 0 0' }}>
              {contact.message}
            </p>
          </Card>

          {contact.status === 'declined' && contact.declineReason ? (
            <Card pad={16}>
              <div className="tm-text-body-lg">거절 사유</div>
              <p className="tm-text-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '10px 0 0' }}>
                {contact.declineReason}
              </p>
            </Card>
          ) : null}

          {actionError ? (
            <div role="status" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
              {actionError}
            </div>
          ) : null}

          {isRecipient && contact.status === 'requested' ? (
            <Card pad={16}>
              <label htmlFor="team-contact-decline-reason" className="tm-text-label">
                거절 사유 (선택)
              </label>
              <textarea
                id="team-contact-decline-reason"
                className="tm-input"
                style={{ marginTop: 6, resize: 'none', lineHeight: 1.5 }}
                rows={3}
                maxLength={200}
                value={declineReason}
                placeholder="거절 사유를 남기면 상대 팀에게 전달돼요."
                onChange={(event) => setDeclineReason(event.target.value)}
                disabled={actionsPending}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="tm-btn tm-btn-lg tm-btn-danger"
                  disabled={actionsPending}
                  onClick={handleDecline}
                >
                  {declineContact.isPending ? '거절하는 중' : '거절'}
                </button>
                <button
                  type="button"
                  className="tm-btn tm-btn-lg tm-btn-primary"
                  disabled={actionsPending}
                  onClick={handleAccept}
                >
                  {acceptContact.isPending ? '수락하는 중' : '수락'}
                </button>
              </div>
            </Card>
          ) : null}

          {!isRecipient && isSender && contact.status === 'requested' ? (
            <button
              type="button"
              className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block"
              disabled={actionsPending}
              onClick={handleWithdraw}
            >
              {withdrawContact.isPending ? '철회하는 중' : '컨택 철회'}
            </button>
          ) : null}

          {contact.status === 'accepted' ? (
            <button
              type="button"
              className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
              disabled={actionsPending}
              onClick={handleOpenChat}
            >
              {resolveChatRoom.isPending ? '여는 중' : '대화 열기'}
            </button>
          ) : null}
        </div>
      </div>
    </AppChrome>
  );
}
