'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { AdminLeagueStatePill, AdminPageHeader } from '@/components/admin';
import { Button } from '@/components/v1-ui/button';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
import { useV1LinkNextSeason, useV1NextSeasonCandidates, useV1UnlinkNextSeason } from '@/hooks/use-v1-api';
import { formatTournamentDateMedium, formatTournamentDateRangeMedium } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { josa } from '@/lib/korean';
import { leagueStateLabel } from '@/lib/v1-status-labels';
import type { V1AdminLeagueDetail, V1NextSeasonCandidate } from '@/types/league-match';
import { leagueInputClass, leagueLabelClass } from '../../league-basic-fields';

type ShowToast = (message: string, variant?: 'success' | 'error') => void;

export type NextSeasonLinkNotice = { tone: 'warning' | 'info'; message: string };

/**
 * 고른 리그를 다음 시즌으로 이을 때 운영자가 알고 있어야 할 것. 막는 사유가 아니라 확인 거리다 —
 * 막는 판정은 서버가 한다(2026-11-19 사용자 확정: 날짜가 거꾸로여도 막지 않고 경고만 한다).
 */
export function nextSeasonLinkNotices(
  previous: Pick<V1AdminLeagueDetail, 'startsOn'>,
  candidate: Pick<V1NextSeasonCandidate, 'startsOn' | 'confirmedCount'>,
): NextSeasonLinkNotice[] {
  const notices: NextSeasonLinkNotice[] = [];
  const previousStart = previous.startsOn ? new Date(previous.startsOn).getTime() : Number.NaN;
  const candidateStart = candidate.startsOn ? new Date(candidate.startsOn).getTime() : Number.NaN;
  if (candidateStart < previousStart) {
    notices.push({
      tone: 'warning',
      message: '고른 리그의 시작일이 이 리그보다 앞서요. 순서가 맞는지 확인해 주세요.',
    });
  }
  if (candidate.confirmedCount > 0) {
    notices.push({
      tone: 'info',
      message: `고른 리그에는 이미 ${candidate.confirmedCount}팀이 참가 확정돼 있어요. 이어도 이 팀과 명단은 그대로예요. 지난 시즌 팀은 참가팀 관리의 "지난 시즌 팀 넣기"로 넣을 수 있어요.`,
    });
  }
  return notices;
}

/**
 * 리그 이름은 운영자가 정한 자유 문자열이라 뒤에 붙는 조사가 끝소리에 따라 달라진다. 따옴표로 감싼 이름에 `josa` 를 쓴다 —
 * 끝의 따옴표·괄호는 읽히지 않아 건너뛴다(2026-11-19 alpha QA: "…다음 리그"을·"…다음 리그"이 로 고정돼 어색했다).
 */
const quoted = (title: string) => `"${title}"`;

export const nextSeasonLinkedToast = (nextTitle: string) =>
  `${josa(quoted(nextTitle), ['을', '를'])} 다음 시즌으로 이었어요.`;

export const nextSeasonLinkedNotice = (nextTitle: string) =>
  `이미 ${josa(quoted(nextTitle), ['이', '가'])} 다음 시즌으로 이어져 있어요.`;

export const nextSeasonLinkConfirmMessage = (previousTitle: string, nextTitle: string) =>
  `${quoted(previousTitle)}의 다음 시즌으로 ${josa(quoted(nextTitle), ['을', '를'])} 이어요. 공개 화면에 다음 시즌 안내가 생기고, 지난 시즌 팀이 재참가 신청을 할 수 있어요. 잘못 이었다면 이 화면에서 풀 수 있어요.`;

export const nextSeasonUnlinkConfirmMessage = (previousTitle: string, nextTitle: string) =>
  `${josa(quoted(previousTitle), ['과', '와'])} ${quoted(nextTitle)}의 연결을 풀어요. 이미 옮겨 온 지난 시즌 명단과 참가 팀은 그대로 남고, 공개 화면의 다음 시즌 안내와 재참가 신청 입구만 사라져요.`;

/** 이름이 비슷한 리그를 가릴 수 있게 상태와 시작일을 목록에 같이 적는다. */
export function candidateOptionLabel(candidate: Pick<V1NextSeasonCandidate, 'title' | 'state' | 'startsOn'>): string {
  const start = formatTournamentDateMedium(candidate.startsOn);
  return `${candidate.title} · ${leagueStateLabel(candidate.state)}${start ? ` · ${start} 시작` : ''}`;
}

/**
 * 다음 시즌 잇기(2026-11-19) — 이미 따로 만든 독립 리그를 이 리그의 다음 시즌으로 잇는다.
 * 후보는 서버가 같은 종목의 독립 리그 중 지난 시즌이 아직 없는 것만 준다. 이어도 이미 들어온 팀과 명단은 바뀌지 않는다.
 */
export function LeagueNextSeasonLink({ league, showToast }: { league: V1AdminLeagueDetail; showToast: ShowToast }) {
  const selectId = useId();
  const candidates = useV1NextSeasonCandidates(league.leagueId);
  const link = useV1LinkNextSeason(league.leagueId);
  const [pickedId, setPickedId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = candidates.data?.candidates.find((candidate) => candidate.leagueId === pickedId) ?? null;
  const notices = picked ? nextSeasonLinkNotices(league, picked) : [];

  const submit = () => {
    if (!picked || link.isPending) return;
    setError(null);
    link.mutate(picked.leagueId, {
      onSuccess: (result) => {
        setConfirming(false);
        setPickedId('');
        showToast(nextSeasonLinkedToast(result.nextSeason.title), 'success');
      },
      onError: (err) => setError(extractErrorMessage(err, '다음 시즌으로 잇지 못했어요.')),
    });
  };

  return (
    <div className="tm-content-enter mx-auto max-w-2xl pb-28">
      <AdminPageHeader
        eyebrow="플랫폼 · 리그"
        title="다음 시즌 잇기"
        description={`이미 만들어 둔 리그를 "${league.title}"의 다음 시즌으로 이어요. 이어도 이미 들어온 팀과 명단은 바뀌지 않아요.`}
      />

      {candidates.isPending ? (
        <p role="status" className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">이을 수 있는 리그를 불러오는 중이에요.</p>
      ) : candidates.isError || !candidates.data ? (
        <ErrorState
          message={extractErrorMessage(candidates.error, '이을 수 있는 리그를 불러오지 못했어요.')}
          onRetry={() => void candidates.refetch()}
        />
      ) : candidates.data.candidates.length === 0 ? (
        <AlertBanner
          tone="info"
          message="이을 수 있는 리그가 없어요. 같은 종목의 독립 리그 중 지난 시즌이 아직 없는 리그만 고를 수 있어요. 먼저 리그를 만들거나 '새로 만들기'를 써 주세요."
        />
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor={selectId} className={leagueLabelClass}>다음 시즌으로 이을 리그</label>
            <select
              id={selectId}
              value={pickedId}
              onChange={(event) => setPickedId(event.target.value)}
              className={leagueInputClass}
            >
              <option value="">리그를 골라 주세요</option>
              {candidates.data.candidates.map((candidate) => (
                <option key={candidate.leagueId} value={candidate.leagueId}>{candidateOptionLabel(candidate)}</option>
              ))}
            </select>
            <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              {candidates.data.hasMore
                ? '최근 시작한 리그 100개만 보여요.'
                : '같은 종목의 독립 리그 중 지난 시즌이 아직 없는 리그예요.'}
            </p>
          </div>

          {picked ? (
            <section aria-label="고른 리그" className="rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[length:var(--font-size-body)] font-semibold text-[var(--text-strong)]">{picked.title}</p>
                <AdminLeagueStatePill state={picked.state} />
              </div>
              <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
                {formatTournamentDateRangeMedium(picked.startsOn, picked.endsOn) ?? '기간 미정'} · 참가 확정 {picked.confirmedCount}팀
              </p>
              <Link
                href={`/admin/league-matches/${encodeURIComponent(picked.leagueId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex min-h-[44px] items-center text-[length:var(--font-size-body-sm)] font-medium text-[var(--blue700)] underline underline-offset-2"
              >
                이 리그 새 창에서 보기
              </Link>
            </section>
          ) : null}

          {notices.map((notice) => (
            <AlertBanner key={notice.message} tone={notice.tone} message={notice.message} />
          ))}

          <Button variant="primary" size="lg" disabled={!picked} onClick={() => { setError(null); setConfirming(true); }}>
            다음 시즌으로 잇기
          </Button>
        </div>
      )}

      <ConfirmModal
        open={confirming && picked !== null}
        title="다음 시즌으로 이을까요?"
        message={nextSeasonLinkConfirmMessage(league.title, picked?.title ?? '')}
        confirmLabel="다음 시즌으로 잇기"
        busy={link.isPending}
        error={error}
        onConfirm={submit}
        onCancel={() => { if (!link.isPending) setConfirming(false); }}
      />
    </div>
  );
}

/**
 * 이미 다음 시즌이 이어진 리그 — 이어진 리그로 가는 길과 연결 해제(쓰기 권한이 있을 때만).
 * 풀어도 이미 옮겨 온 지난 시즌 명단과 참가 팀은 그대로 남는다.
 */
export function LeagueNextSeasonLinked({
  league,
  canWrite,
  showToast,
}: {
  league: V1AdminLeagueDetail;
  canWrite: boolean;
  showToast: ShowToast;
}) {
  const unlink = useV1UnlinkNextSeason(league.leagueId);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextSeason = league.nextSeason;
  if (!nextSeason) return null;

  const submit = () => {
    if (unlink.isPending) return;
    setError(null);
    unlink.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        showToast('다음 시즌 연결을 풀었어요.', 'success');
      },
      onError: (err) => setError(extractErrorMessage(err, '다음 시즌 연결을 풀지 못했어요.')),
    });
  };

  return (
    <div className="tm-content-enter mx-auto flex max-w-2xl flex-col gap-3 pb-28">
      <AlertBanner tone="info" message={nextSeasonLinkedNotice(nextSeason.title)} />
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/league-matches/${encodeURIComponent(nextSeason.leagueId)}`} className="tm-btn tm-btn-md tm-btn-outline">
          다음 시즌 관리로 가기
        </Link>
        {canWrite ? (
          <Button variant="outline" onClick={() => { setError(null); setConfirming(true); }}>
            연결 해제
          </Button>
        ) : null}
      </div>
      <ConfirmModal
        open={confirming}
        title="다음 시즌 연결을 풀까요?"
        message={nextSeasonUnlinkConfirmMessage(league.title, nextSeason.title)}
        confirmLabel="연결 해제"
        busy={unlink.isPending}
        error={error}
        onConfirm={submit}
        onCancel={() => { if (!unlink.isPending) setConfirming(false); }}
      />
    </div>
  );
}
