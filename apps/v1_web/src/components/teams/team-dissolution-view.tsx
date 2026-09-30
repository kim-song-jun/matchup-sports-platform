'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Ban, CalendarX, Check, MessageSquareOff, Radio, Swords, Trophy, UserX } from 'lucide-react';
import { AlertBanner, Card, TextField } from '@/components/v1-ui/primitives';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1TeamDissolutionBlocker, V1TeamDissolutionPreview } from '@/types/api';

type Tone = 'orange' | 'red';

function RowIcon({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 32,
        height: 32,
        borderRadius: 'var(--radius-circle)',
        background: `var(--${tone}50)`,
        color: `var(--${tone}700)`,
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
      }}
    >
      {children}
    </span>
  );
}

const pageStyle = { padding: '16px var(--v1-shell-page-x) calc(148px + var(--v1-shell-safe-bottom))' };

function DissolveFooter({ note, cancelHref, action }: { note: string; cancelHref: string; action: ReactNode }) {
  return (
    <div className="tm-fixed-cta">
      <div className="tm-text-caption" style={{ marginBottom: 8 }}>{note}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={cancelHref}>취소</Link>
        {action}
      </div>
    </div>
  );
}

type CleanupRow = { key: string; icon: ReactNode; title: string; sub: string };

/** 해체가 실제로 정리하는 범위 — 0건인 줄은 빼고, 팀 채팅은 언제나 닫힌다. */
export function cleanupRows(cleanup: V1TeamDissolutionPreview['cleanup']): CleanupRow[] {
  const rows: CleanupRow[] = [];
  if (cleanup.recruitingTeamMatchCount > 0) {
    rows.push({ key: 'matches', icon: <Swords size={16} />, title: `모집 중인 팀매치 ${cleanup.recruitingTeamMatchCount}건 취소`, sub: '지원한 팀에게 취소 알림이 가요' });
  }
  if (cleanup.outgoingApplicationCount > 0) {
    rows.push({ key: 'outgoing', icon: <Ban size={16} />, title: `보낸 팀매치 신청 ${cleanup.outgoingApplicationCount}건 철회`, sub: '상대 팀에게 신청 취소 알림이 가요' });
  }
  const joinParts = [
    cleanup.joinApplicationCount > 0 ? `가입 신청 ${cleanup.joinApplicationCount}건` : null,
    cleanup.invitationCount > 0 ? `보낸 초대 ${cleanup.invitationCount}건` : null,
  ].filter((part): part is string => part !== null);
  if (joinParts.length > 0) {
    rows.push({ key: 'join', icon: <UserX size={16} />, title: `${joinParts.join(' · ')} 종료`, sub: '신청·초대받은 분에게 종료 안내가 가요' });
  }
  const schedules = cleanup.upcomingSchedules;
  if (schedules.length > 0) {
    const first = schedules[0];
    const firstLabel = [formatTournamentDateTimeShort(first.startAt), first.title].filter(Boolean).join(' ');
    rows.push({
      key: 'schedules',
      icon: <CalendarX size={16} />,
      title: `예정된 팀 일정 ${schedules.length}건 취소`,
      sub: schedules.length > 1 ? `${firstLabel} 외 ${schedules.length - 1}건` : firstLabel,
    });
  }
  rows.push({ key: 'chat', icon: <MessageSquareOff size={16} />, title: '팀 채팅방 닫힘', sub: '복구하면 다시 열려요' });
  return rows;
}

const KEPT = ['지난 경기 결과와 팀 전적', '멤버 개인 기록과 받은 후기', '지난 경기 기록에 나오는 팀 이름'];

export function TeamDissolutionReadyView({
  preview,
  confirmName,
  onConfirmNameChange,
  nameFieldId,
  nameError,
  error,
  submitting,
  onSubmit,
  cancelHref,
}: {
  preview: V1TeamDissolutionPreview;
  confirmName: string;
  onConfirmNameChange: (value: string) => void;
  nameFieldId: string;
  nameError?: string | null;
  error?: string | null;
  submitting: boolean;
  onSubmit: () => void;
  cancelHref: string;
}) {
  const nameMatches = confirmName.trim() === preview.teamName.trim();
  const rows = cleanupRows(preview.cleanup);
  const notify = preview.cleanup.notifyMemberCount;
  return (
    <>
      <div className="tm-content-enter" style={pageStyle}>
        <h2 className="tm-text-heading" style={{ overflowWrap: 'anywhere' }}>{preview.teamName} 팀을<br />해체할까요?</h2>
        <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.55 }}>
          해체하면 팀이 목록과 검색에서 사라지고 새 활동이 모두 멈춰요. 지난 경기 기록은 그대로 남아요.
          {notify > 0 ? ` 팀원 ${notify}명에게 해체 알림이 가요.` : null}
        </div>
        {error ? <div style={{ marginTop: 16 }}><AlertBanner message={error} /></div> : null}
        <section style={{ marginTop: 20 }} aria-labelledby={`${nameFieldId}-cleanup`}>
          <h3 id={`${nameFieldId}-cleanup`} className="tm-text-label" style={{ margin: 0 }}>함께 정리돼요</h3>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>해체하는 순간 자동으로 처리돼요.</div>
          <Card pad={0} style={{ padding: '4px 16px', marginTop: 10 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((row, index) => (
                <li
                  key={row.key}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: index === 0 ? undefined : '1px solid var(--line)' }}
                >
                  <RowIcon tone="orange">{row.icon}</RowIcon>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tm-text-body" style={{ color: 'var(--text-strong)', lineHeight: 1.35 }}>{row.title}</div>
                    <div className="tm-text-caption" style={{ marginTop: 2 }}>{row.sub}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
        <section style={{ marginTop: 20 }} aria-labelledby={`${nameFieldId}-kept`}>
          <h3 id={`${nameFieldId}-kept`} className="tm-text-label" style={{ margin: 0 }}>그대로 남아요</h3>
          <Card pad={0} style={{ padding: '8px 16px', marginTop: 10 }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {KEPT.map((label) => (
                <li key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <span aria-hidden="true" style={{ color: 'var(--green700)', display: 'inline-flex' }}><Check size={16} /></span>
                  <span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>{label}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
        <TextField
          fieldId={nameFieldId}
          label="팀 이름을 입력하면 해체할 수 있어요"
          value={confirmName}
          placeholder={preview.teamName}
          autoComplete="off"
          maxLength={50}
          error={nameError}
          onChange={(event) => onConfirmNameChange(event.target.value)}
        />
      </div>
      <DissolveFooter
        note={`잘못 눌렀다면 ${preview.restoreWindowDays}일 안에 마이 > 팀 > 해체한 팀에서 복구할 수 있어요.`}
        cancelHref={cancelHref}
        action={
          <button className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block" type="button" disabled={!nameMatches || submitting} onClick={onSubmit}>
            {submitting ? '해체하는 중…' : '팀 해체하기'}
          </button>
        }
      />
    </>
  );
}

type BlockerItem = V1TeamDissolutionBlocker['items'][number];

/** 막는 조건마다 무엇을 하면 풀리는지와 그 화면으로 가는 버튼 문구. */
function blockerCopy(kind: V1TeamDissolutionBlocker['kind'], count: number) {
  switch (kind) {
    case 'live_game':
      return { icon: <Radio size={16} />, title: `진행 중인 경기 ${count}건`, desc: '경기가 끝나면 해체할 수 있어요.' };
    case 'matched_team_match':
      return { icon: <Swords size={16} />, title: `상대가 정해진 팀매치 ${count}건`, desc: '상대 팀이 정해진 경기예요. 취소하면 상대 팀 팀장·매니저에게 알림이 가요.' };
    case 'league_entry':
      return { icon: <Trophy size={16} />, title: `참가 중인 리그 ${count}건`, desc: '리그 대진에 들어간 팀은 직접 나갈 수 없어요. 참가 취소를 요청하면 리그 운영팀이 확인해요.' };
    case 'tournament_entry':
      return { icon: <Trophy size={16} />, title: `참가 신청한 대회 ${count}건`, desc: '대회가 끝나거나 참가 신청을 취소하면 해체할 수 있어요.' };
  }
}

function blockerActionLabel(kind: V1TeamDissolutionBlocker['kind'], item: BlockerItem, now: number) {
  if (item.registrationStatus === 'cancel_requested') return '취소 요청 상태 보기';
  if (kind === 'league_entry') return '참가 취소 요청하기';
  if (kind === 'tournament_entry') return '참가 신청 보러 가기';
  if (kind === 'matched_team_match' && (item.startAt === null || Date.parse(item.startAt) > now)) return '경기 취소하러 가기';
  return '경기 보러 가기';
}

function blockerItemMeta(item: BlockerItem) {
  const when = [formatTournamentDateTimeShort(item.startAt), item.placeName].filter(Boolean).join(' ');
  const head = item.opponentName ? `${item.title} · vs ${item.opponentName}` : item.title;
  const status = item.registrationStatus === 'cancel_requested' ? '취소 요청 중' : null;
  return [head, when || null, status].filter(Boolean).join(' · ');
}

export function TeamDissolutionBlockedView({
  preview,
  cancelHref,
  error,
}: {
  preview: V1TeamDissolutionPreview;
  cancelHref: string;
  error?: string | null;
}) {
  const now = Date.now();
  const count = preview.blockers.length;
  const { joinApplicationCount, invitationCount, upcomingSchedules, recruitingTeamMatchCount, notifyMemberCount } = preview.cleanup;
  const autoParts = [
    recruitingTeamMatchCount > 0 ? `모집 중인 팀매치 ${recruitingTeamMatchCount}건` : null,
    joinApplicationCount > 0 ? `가입 신청 ${joinApplicationCount}건` : null,
    invitationCount > 0 ? `보낸 초대 ${invitationCount}건` : null,
    upcomingSchedules.length > 0 ? `예정 팀 일정 ${upcomingSchedules.length}건` : null,
  ].filter((part): part is string => part !== null);
  const autoNote = [
    autoParts.length > 0 ? `${autoParts.join(', ')}은 해체할 때 함께 정리돼요.` : null,
    notifyMemberCount > 0 ? `팀원 ${notifyMemberCount}명에게는 해체 알림이 가요.` : null,
  ].filter(Boolean).join(' ');
  return (
    <>
      <div className="tm-content-enter" style={pageStyle}>
        <h2 className="tm-text-heading">지금은 해체할 수 없어요</h2>
        <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.55 }}>
          아래 {count}가지를 먼저 정리해 주세요. 정리하고 나면 바로 해체할 수 있어요.
        </div>
        {error ? <div style={{ marginTop: 16 }}><AlertBanner message={error} /></div> : null}
        <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 12 }} aria-label="해체를 막는 조건">
          {preview.blockers.map((blocker) => {
            const copy = blockerCopy(blocker.kind, blocker.items.length);
            return (
              <li key={blocker.kind}>
                <Card pad={16}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <RowIcon tone="red">{copy.icon}</RowIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="tm-text-body" style={{ margin: 0, color: 'var(--text-strong)', lineHeight: 1.35 }}>{copy.title}</h3>
                      <div className="tm-text-caption" style={{ marginTop: 2, lineHeight: 1.55 }}>{copy.desc}</div>
                    </div>
                  </div>
                  {blocker.items.map((item) => (
                    <div key={item.id} style={{ marginTop: 12 }}>
                      <div className="tm-text-caption" style={{ color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{blockerItemMeta(item)}</div>
                      {item.route ? (
                        <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href={item.route} style={{ marginTop: 8 }}>
                          {blockerActionLabel(blocker.kind, item, now)}
                        </Link>
                      ) : (
                        <div className="tm-text-caption" style={{ marginTop: 4 }}>이 항목은 운영팀에 문의해 정리해 주세요.</div>
                      )}
                    </div>
                  ))}
                </Card>
              </li>
            );
          })}
        </ul>
        {autoNote ? <div style={{ marginTop: 16 }}><AlertBanner tone="info" message={`막지 않는 것: ${autoNote}`} /></div> : null}
      </div>
      <DissolveFooter
        note={`정리할 것이 ${count}가지 남아 있어요.`}
        cancelHref={cancelHref}
        action={<button className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block" type="button" disabled>팀 해체하기</button>}
      />
    </>
  );
}
