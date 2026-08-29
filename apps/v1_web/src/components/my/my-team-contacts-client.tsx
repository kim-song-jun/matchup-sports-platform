'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ErrorState, ListItem } from '@/components/v1-ui/primitives';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import {
  useV1AcceptTeamContact,
  useV1CreateInquiry,
  useV1CreateTeamContactBlock,
  useV1DeclineTeamContact,
  useV1MyTeams,
  useV1ResolveChatRoom,
  useV1Team,
  useV1TeamContact,
  useV1TeamContacts,
  useV1WithdrawTeamContact,
} from '@/hooks/use-v1-api';
import type { V1TeamContact, V1TeamContactStatus } from '@/hooks/use-v1-api';
import type { V1InquiryReportReason } from '@/types/api';
import { chatRoomHref } from '@/lib/chat-route';
import { formatTournamentDateTimeLong, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { isTeamOperatorRole, normalizeMyTeamsResponse } from '@/lib/team-role';
import { INQUIRY_REPORT_REASON_OPTIONS as REPORT_REASON_OPTIONS, inquiryReportReasonLabel } from '@/lib/v1-status-labels';

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

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * 컨택 만료까지 남은 시간 — 기존 date-utils 포맷터와 다른 "카운트다운" 값이라 로컬 계산.
 *
 * 컨택 만료 창은 7일이라 시간 단위만 쓰면 `167시간 58분 후 만료돼요` 처럼 사람이 못 읽는
 * 숫자가 나온다(alpha 시각 검증에서 실제로 그렇게 보였다). 하루 이상 남았으면 일 단위로 접는다.
 *
 * 남은 시간은 **항상 내림한다.** 만료 안내를 실제보다 길게 말하면 사용자가 늦게 대응하므로,
 * 6일 23시간이 남았을 때 "7일" 이 아니라 "6일 23시간" 으로 보수적으로 표시한다.
 */
function formatExpiresIn(expiresAt: string): string {
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return '곧 만료돼요';

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  if (days >= 1) {
    const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
    return hours > 0 ? `${days}일 ${hours}시간 후 만료돼요` : `${days}일 후 만료돼요`;
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
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
          <div style={{ marginBottom: 16 }}>
            <div className="tm-text-heading">팀 컨택함</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>
              다른 팀과 주고받은 컨택 메시지를 확인해요.
            </div>
          </div>

          {operatorTeams.length >= 2 ? (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="team-contacts-team" className="tm-text-label">
                팀 선택
              </label>
              <select
                id="team-contacts-team"
                className="tm-input tm-input-select"
                style={{ marginTop: 8 }}
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
                style={{ marginBottom: 16, gridTemplateColumns: '1fr 1fr' }}
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

/**
 * 컨택 상세에서 상대 팀을 신고하는 다이얼로그. 공용 Modal 이 없어
 * jersey-number-dialog.tsx 의 관용구(role=dialog + ESC + focus trap)를 그대로 따르다가,
 * focus 저장·복원/ESC/Tab 트랩/body 스크롤 잠금은 공용 `useModalA11y` 훅으로 이관했다
 * (이 컴포넌트엔 원래 스크롤 잠금이 빠져 있었다 — 훅이 채워준다).
 */
function ReportContactDialog({
  open,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: V1InquiryReportReason, detail: string) => void;
}) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-report-title`;
  const [reason, setReason] = useState<V1InquiryReportReason | null>(null);
  const [detail, setDetail] = useState('');

  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({ open, onClose });

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetail('');
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[360px] rounded-2xl overflow-hidden"
        style={{ background: 'var(--card-surface, #fff)', boxShadow: '0 8px 32px rgba(20,28,45,0.14)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '24px 20px 16px', display: 'grid', gap: 12 }}>
          <p id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
            컨택 신고하기
          </p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
            신고 사유를 선택해 주세요. 상세 설명은 선택이에요.
          </p>

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            <legend className="tm-text-label" style={{ padding: 0, marginBottom: 4 }}>
              신고 사유
            </legend>
            {REPORT_REASON_OPTIONS.map((option) => {
              const inputId = `${idPrefix}-reason-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={inputId}
                  className="tm-text-body"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 44,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    id={inputId}
                    name="team-contact-report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                  />
                  {option.label}
                </label>
              );
            })}
          </fieldset>

          <label htmlFor={`${idPrefix}-report-detail`} className="tm-text-label">
            상세 설명 (선택)
          </label>
          <textarea
            id={`${idPrefix}-report-detail`}
            className="tm-input"
            style={{ resize: 'none', lineHeight: 1.5 }}
            rows={3}
            maxLength={500}
            value={detail}
            placeholder="상황을 알려주시면 검토에 도움이 돼요."
            onChange={(event) => setDetail(event.target.value)}
            disabled={saving}
          />

          {error !== null ? (
            <p className="tm-text-caption" role="alert" style={{ color: 'var(--red700)', margin: 0 }}>
              {error}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 20px 20px' }}>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-danger"
            disabled={reason === null || saving}
            onClick={() => {
              if (reason === null) return;
              onSubmit(reason, detail);
            }}
          >
            {saving ? '접수하는 중' : '신고 접수'}
          </button>
        </div>
      </div>
    </div>
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

  // 차단은 "내 팀" 명의로 상대 팀을 막는 것이다. 훅은 조건부로 부를 수 없으므로 아래 early
  // return 보다 앞에서 팀 id 를 계산해 둔다(컨택이 아직 없으면 빈 문자열 — 그 상태에서는
  // 차단 UI 자체가 렌더되지 않으므로 mutate 가 불릴 일이 없다).
  const viewerIsRecipient = contact ? operatorTeamIds.has(contact.toTeamId) : false;
  const viewerIsSender = contact ? operatorTeamIds.has(contact.fromTeamId) : false;
  const blockActorTeamId = contact ? (viewerIsRecipient ? contact.toTeamId : contact.fromTeamId) : '';
  const createBlock = useV1CreateTeamContactBlock(blockActorTeamId);
  const [blockConfirming, setBlockConfirming] = useState(false);
  const [blockCreated, setBlockCreated] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const acceptContact = useV1AcceptTeamContact(contactId);
  const declineContact = useV1DeclineTeamContact(contactId);
  const withdrawContact = useV1WithdrawTeamContact(contactId);
  const resolveChatRoom = useV1ResolveChatRoom();
  const reportContact = useV1CreateInquiry();

  const [declineReason, setDeclineReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

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

  const isRecipient = viewerIsRecipient;
  const isSender = viewerIsSender;
  const fromTeamName = fromTeamQuery.data?.name ?? '팀';
  const toTeamName = toTeamQuery.data?.name ?? '팀';
  const counterpartTeamId = isRecipient ? contact.fromTeamId : contact.toTeamId;
  const counterpartTeamName = isRecipient ? fromTeamName : toTeamName;
  // 양쪽 팀을 모두 내가 운영하는 경우엔 차단이 자기 차단이 되어 서버가 409 로 막는다 — 숨긴다.
  const canBlock = isRecipient !== isSender;
  const actionsPending =
    acceptContact.isPending || declineContact.isPending || withdrawContact.isPending || resolveChatRoom.isPending;

  function handleCreateBlock() {
    setBlockError(null);
    createBlock.mutate(
      { blockedTeamId: counterpartTeamId },
      {
        onSuccess: () => {
          setBlockConfirming(false);
          setBlockCreated(true);
        },
        onError: (err) =>
          setBlockError(extractErrorMessage(err, '차단하지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  }

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

  function handleReportSubmit(reason: V1InquiryReportReason, detail: string) {
    setReportError(null);
    const reasonLabel = inquiryReportReasonLabel(reason);
    const trimmedDetail = detail.trim();
    reportContact.mutate(
      {
        category: 'report',
        relatedType: 'team_contact',
        relatedId: contactId,
        reportReason: reason,
        title: `팀 컨택 신고: ${reasonLabel}`,
        // body 는 백엔드가 필수로 검증한다 — 상세 설명을 안 남기면 사유 라벨로 채워 빈 문자열을 막는다.
        body: trimmedDetail.length > 0 ? trimmedDetail : reasonLabel,
      },
      {
        onSuccess: () => {
          setReportDialogOpen(false);
          setReportSubmitted(true);
        },
        onError: (err) => setReportError(extractErrorMessage(err, '신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.')),
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
                <div className="tm-text-caption" style={{ marginTop: 8 }}>
                  {formatTournamentDateTimeLong(contact.createdAt)}
                </div>
              </div>
              <span className={`tm-badge ${STATUS_BADGE_CLASS[contact.status]}`}>
                {STATUS_LABEL[contact.status]}
              </span>
            </div>
            {contact.status === 'requested' ? (
              <div className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-muted)' }}>
                {formatExpiresIn(contact.expiresAt)}
              </div>
            ) : null}
          </Card>

          <Card pad={16}>
            <div className="tm-text-body-lg">전달 메시지</div>
            <p className="tm-text-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '12px 0 0' }}>
              {contact.message}
            </p>
          </Card>

          {contact.status === 'declined' && contact.declineReason ? (
            <Card pad={16}>
              <div className="tm-text-body-lg">거절 사유</div>
              <p className="tm-text-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '12px 0 0' }}>
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
                style={{ marginTop: 8, resize: 'none', lineHeight: 1.5 }}
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

          {/* 신고는 컨택 상태와 무관하게 항상 노출한다 — 만료·거절된 컨택도 부적절한
              메시지였을 수 있고, 오히려 거절·만료 이후에 신고할 이유가 생기기도 한다. */}
          {reportSubmitted ? (
            <div role="status" className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              신고가 접수됐어요. 검토 후 처리할게요.
            </div>
          ) : (
            <button
              type="button"
              className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block"
              onClick={() => setReportDialogOpen(true)}
            >
              신고하기
            </button>
          )}

          {/* 차단 걸기는 여기가 진입점이다 — 해제는 팀 설정 화면에 있다. 되돌릴 수 있는 동작이고
              같은 도메인의 '차단 해제' 도 확인 단계를 두지 않으므로, 모달 대신 2단계 인라인
              확인으로 오클릭만 막는다. */}
          {!canBlock ? null : blockCreated ? (
            <div role="status" className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              {counterpartTeamName} 팀을 차단했어요. 이제 이 팀은 컨택을 보낼 수 없어요. 팀 설정에서 해제할 수 있어요.
            </div>
          ) : blockConfirming ? (
            <div role="group" aria-label="팀 차단 확인" style={{ display: 'grid', gap: 8 }}>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                차단하면 {counterpartTeamName} 팀은 우리 팀에 컨택을 보낼 수 없어요. 팀 설정에서 언제든 해제할 수 있어요.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="tm-btn tm-btn-lg tm-btn-neutral"
                  style={{ flex: 1, minHeight: 44 }}
                  onClick={() => setBlockConfirming(false)}
                  disabled={createBlock.isPending}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="tm-btn tm-btn-lg tm-btn-danger"
                  style={{ flex: 1, minHeight: 44 }}
                  onClick={handleCreateBlock}
                  disabled={createBlock.isPending}
                >
                  {createBlock.isPending ? '차단하는 중' : '차단하기'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block"
              style={{ minHeight: 44 }}
              onClick={() => setBlockConfirming(true)}
            >
              차단하기
            </button>
          )}

          {blockError ? (
            <div role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
              {blockError}
            </div>
          ) : null}
        </div>
      </div>

      <ReportContactDialog
        open={reportDialogOpen}
        saving={reportContact.isPending}
        error={reportError}
        onClose={() => {
          setReportDialogOpen(false);
          setReportError(null);
        }}
        onSubmit={handleReportSubmit}
      />
    </AppChrome>
  );
}
