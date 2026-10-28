'use client';
import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { useV1ApplyBracketTemplate } from '@/hooks/use-v1-bracket-canvas';
import { v1Get, v1Post, v1Put } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { v1Keys } from '@/lib/query-keys';
import { randomUuid } from '@/lib/uuid';
import type {
  FlexibleBracketInput,
  FlexibleBracketPreview,
  V1SixTeamBracket,
} from '@/types/api';
import type { BracketTemplateDialogProps } from './bracket-template-dialog';

export function SixTeamTemplateDialog(
  props: BracketTemplateDialogProps & { onStandard: () => void }
) {
  const id = useId();
  const teams = useV1AdminTournamentRegistrations(props.tournamentId);
  const confirmed = (teams.data?.items ?? []).filter(
    (row) => row.status === 'confirmed'
  );
  const [assignments, setAssignments] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<FlexibleBracketPreview | null>(null);
  const apply = useV1ApplyBracketTemplate(props.tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const queryClient = useQueryClient();
  const requestId = useState(randomUuid)[0];
  const input: FlexibleBracketInput = {
    schemaVersion: 2,
    sixTeamMode: true,
    kind: 'knockout',
    size: 6,
    participantCount: 6,
    legs: 1,
    thirdPlace: false,
    drawSeed: 0,
    seedPolicy: 'seeded',
    registrationIds: assignments,
  };
  const base = `/admin/tournaments/${encodeURIComponent(
    props.tournamentId
  )}/bracket/template`;
  const showPreview = useMutation({
    mutationFn: () => v1Post<FlexibleBracketPreview>(`${base}/preview`, input),
    onSuccess: setPreview,
    onError: (e) =>
      setError(extractErrorMessage(e, '미리보기를 불러오지 못했어요.')),
  });
  const busy = apply.isPending || showPreview.isPending;
  const { mounted, dialogRef, onBackdropClick } = useModalA11y({
    open: props.open,
    onClose: props.onClose,
    pending: busy,
  });
  if (!mounted || typeof document === 'undefined') return null;
  return (
    <>
      {createPortal(<div
        style={{ zIndex: 'var(--z-modal)' }}
        className="fixed inset-0 flex items-center justify-center p-4 tm-modal-scrim"
        onClick={onBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
          className="tm-modal-panel max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[var(--card-surface)] p-5 text-[var(--text-strong)]"
        >
          <h2 id={id} className="tm-text-body-lg font-bold">
            6팀 토너먼트 방식
          </h2>
          <p className="tm-text-body my-3">
            6강에서 3경기를 치르고, 승리팀 중 성적이 가장 높은 팀이 결승으로
            직행해요. 나머지 두 팀은 준결승에서 만나요.
          </p>
          <p className="tm-text-caption text-[var(--text-muted)]">
            최다 득점 → 최대 득실차 → 최소 실점 · 운영자가 모든 단계에서
            진출팀을 지정할 수 있어요.
          </p>
          <fieldset disabled={busy} className="my-5 space-y-3">
            <legend className="tm-text-label mb-3 font-semibold">
              6강 대진 배정 · 확정팀 {confirmed.length}/6
            </legend>
            {teams.isError ? (
              <p role="alert">
                참가팀을 불러오지 못했어요.{' '}
                <Button variant="neutral" onClick={() => void teams.refetch()}>
                  다시 시도
                </Button>
              </p>
            ) : teams.isPending ? (
              <p role="status">참가팀을 불러오고 있어요.</p>
            ) : (
              assignments.map((value, index) => (
                <label
                  key={index}
                  className="flex flex-col gap-1 tm-text-label"
                >
                  {Math.floor(index / 2) + 1}경기 ·{' '}
                  {index % 2 === 0 ? '홈' : '원정'}
                  <select
                    className="tm-input min-h-11"
                    value={value}
                    onChange={(e) => {
                      const next = [...assignments];
                      next[index] = e.target.value;
                      setAssignments(next);
                      setPreview(null);
                      setError('');
                    }}
                  >
                    <option value="">팀 선택</option>
                    {confirmed.map((row) => (
                      <option
                        key={row.id}
                        value={row.id}
                        disabled={
                          assignments.includes(row.id) && value !== row.id
                        }
                      >
                        {row.teamName}
                      </option>
                    ))}
                  </select>
                </label>
              ))
            )}
          </fieldset>
          {preview && (
            <p role="status" className="tm-text-body mb-4">
              6강 3경기 → 결승 직행팀 선정 → 준결승 1경기 → 결승 1경기 · 총{' '}
              {preview.counts.fixtures}경기
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="tm-text-caption text-[var(--red700)] mb-3"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="neutral" disabled={busy} onClick={props.onClose}>
              닫기
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={props.onStandard}
            >
              일반 토너먼트 설정
            </Button>
            {!preview ? (
              <Button
                variant="primary"
                disabled={
                  busy ||
                  confirmed.length !== 6 ||
                  new Set(assignments.filter(Boolean)).size !== 6
                }
                onClick={() => showPreview.mutate()}
              >
                6강 방식 미리보기
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  if (
                    props.hasExistingBracket &&
                    !(await confirm({
                      title: '기존 대진 교체',
                      message:
                        '시작 전 기존 대진을 6강 전용 5경기로 교체해요. 계속할까요?',
                      confirmLabel: '교체',
                      tone: 'danger',
                    }))
                  )
                    return;
                  apply.mutate(
                    {
                      ...input,
                      previewHash: preview.previewHash,
                      requestId,
                      replaceExisting: props.hasExistingBracket,
                    },
                    {
                      onSuccess: () => {
                        void Promise.all(
                          [
                            v1Keys.adminTournamentBracket(props.tournamentId),
                            v1Keys.adminTournament(props.tournamentId),
                            v1Keys.tournament(props.tournamentId),
                            ['six-team-mode', props.tournamentId],
                          ].map((queryKey) =>
                            queryClient.invalidateQueries({ queryKey })
                          )
                        );
                        props.showToast(
                          '6강 전용 5경기를 만들었어요.',
                          'success'
                        );
                        props.onApplied?.();
                        props.onClose();
                      },
                      onError: (e) => {
                        setPreview(null);
                        setError(
                          extractErrorMessage(
                            e,
                            '대진을 만들지 못했어요. 다시 미리보기를 확인해 주세요.'
                          )
                        );
                      },
                    }
                  );
                }}
              >
                6강 대진 만들기
              </Button>
            )}
          </div>
        </div>
      </div>, document.body)}
      {ConfirmModal}
    </>
  );
}

type Decision = {
  state: V1SixTeamBracket;
  results: Array<{
    id: string;
    homeRegistrationId: string | null;
    awayRegistrationId: string | null;
  }>;
  teams: Array<{ id: string; team: { name: string } }>;
  version: string;
  candidates: Array<{
    fixtureId: string;
    registrationId: string;
    goalsFor: number | null;
    goalsAgainst: number | null;
  }>;
};
export function SixTeamDecisionPanel({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const base = `/admin/tournaments/${encodeURIComponent(tournamentId)}`;
  const queryClient = useQueryClient();
  const tournament = useQuery({
    queryKey: ['six-team-mode', tournamentId],
    queryFn: () => v1Get<{ sixTeamBracket: V1SixTeamBracket | null }>(base),
  });
  const query = useQuery({
    queryKey: ['six-team-decision', tournamentId],
    queryFn: () => v1Get<Decision>(`${base}/bracket/six-team`),
    enabled: Boolean(tournament.data?.sixTeamBracket),
  });
  const [winners, setWinners] = useState<Record<string, string> | null>(null);
  const [bye, setBye] = useState<string | null>(null);
  const [swapSemi, setSwapSemi] = useState<boolean | null>(null);
  const [swapFinal, setSwapFinal] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const update = useMutation({
    mutationFn: (manual: boolean) =>
      v1Put<Decision>(`${base}/bracket/six-team`, {
        version: query.data!.version,
        reason,
        manual,
        swapSemi: swapSemi ?? query.data!.state.swapSemi ?? false,
        swapFinal: swapFinal ?? query.data!.state.swapFinal ?? false,
        bye: (bye ?? query.data!.state.bye) || undefined,
        winners: winners ?? query.data!.state.winners,
      }),
    onSuccess: () => {
      setWinners(null);
      setBye(null);
      setSwapSemi(null);
      setSwapFinal(null);
      setReason('');
      setError('');
      void Promise.all(
        [
          v1Keys.adminTournamentBracket(tournamentId),
          v1Keys.adminTournament(tournamentId),
          v1Keys.tournament(tournamentId),
          ['six-team-mode', tournamentId],
          ['six-team-decision', tournamentId],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      );
    },
    onError: (e) =>
      setError(extractErrorMessage(e, '진출팀을 변경하지 못했어요.')),
  });
  if (tournament.isError)
    return (
      <p role="alert">
        6강 설정을 불러오지 못했어요.{' '}
        <Button variant="neutral" onClick={() => void tournament.refetch()}>
          다시 시도
        </Button>
      </p>
    );
  if (!tournament.data?.sixTeamBracket) return null;
  if (!query.data)
    return (
      <p role={query.isError ? 'alert' : 'status'}>
        {query.isError
          ? '진출팀을 불러오지 못했어요.'
          : '진출팀을 불러오고 있어요.'}
        <Button variant="neutral" onClick={() => void query.refetch()}>
          다시 불러오기
        </Button>
      </p>
    );
  const data = query.data;
  const selected = winners ?? data.state.winners;
  const candidateIds = data.results.slice(0, 3).map(row => selected[row.id] ?? data.candidates.find(candidate => candidate.fixtureId === row.id)?.registrationId).filter(Boolean);
  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
      <div role="heading" aria-level={3}>
        <SectionTitle title="6강 진출 관리" />
      </div>
      <p className="tm-text-caption">
        공식 결과에 따라 자동 배정해요. 직접 선택하면 기록은 유지하고 진출
        결정만 바뀌어요.
      </p>
      {data.state.needsReview && (
        <p role="alert">근거 결과가 정정됐어요. 진출팀을 다시 확인해 주세요.</p>
      )}
      <fieldset
        disabled={update.isPending}
        className="grid gap-3 md:grid-cols-2"
      >
        {data.results.map((row, i) => (
          <label key={row.id} className="flex flex-col gap-1 tm-text-label">
            {i < 3
              ? `6강 ${i + 1}경기 진출팀`
              : i === 3
              ? '준결승 승리팀 · 결승 진출'
              : '결승 우승팀'}
            <select
              className="tm-input min-h-11"
              value={selected[row.id] ?? ''}
              onChange={(e) => {
                const next = { ...selected };
                if (e.target.value) next[row.id] = e.target.value;
                else delete next[row.id];
                setWinners(next);
                if (i < 3) setBye('');
              }}
            >
              <option value="">공식 결과 따르기</option>
              {[row.homeRegistrationId, row.awayRegistrationId]
                .filter(Boolean)
                .map((id) => (
                  <option key={id} value={id!}>
                    {data.teams.find((team) => team.id === id)?.team.name ??
                      '비공개'}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <label className="flex flex-col gap-1 tm-text-label">
          결승 직행팀
          <select
            className="tm-input min-h-11"
            value={bye ?? data.state.bye ?? ''}
            onChange={(e) => setBye(e.target.value)}
          >
            <option value="">선택 대기</option>
            {data.teams.filter(team => candidateIds.includes(team.id)).map((team) => (
              <option key={team.id} value={team.id}>
                {team.team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-h-11 flex items-center gap-2 tm-text-label">
          <input
            type="checkbox"
            checked={swapSemi ?? data.state.swapSemi ?? false}
            onChange={(e) => setSwapSemi(e.target.checked)}
          />
          준결승 홈·원정 순서 바꾸기
        </label>
        <label className="min-h-11 flex items-center gap-2 tm-text-label">
          <input
            type="checkbox"
            checked={swapFinal ?? data.state.swapFinal ?? false}
            onChange={(e) => setSwapFinal(e.target.checked)}
          />
          결승 홈·원정 순서 바꾸기
        </label>
        <label className="flex flex-col gap-1 tm-text-label md:col-span-2">
          변경 사유
          <input
            className="tm-input min-h-11"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="tm-text-caption text-[var(--red700)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={
            update.isPending || !reason.trim() || !(bye ?? data.state.bye)
          }
          onClick={() => update.mutate(true)}
        >
          직접 지정 저장
        </Button>
        <Button
          variant="outline"
          disabled={update.isPending || !reason.trim()}
          onClick={() => update.mutate(false)}
        >
          성적 기준으로 직행팀 선정
        </Button>
        <Button
          variant="neutral"
          disabled={update.isPending}
          onClick={() => {
            setWinners(null);
            setBye(null);
            setSwapSemi(null);
            setSwapFinal(null);
            void query.refetch();
          }}
        >
          다시 불러오기
        </Button>
      </div>
    </section>
  );
}
