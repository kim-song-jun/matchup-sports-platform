'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { useV1ClaimableParticipants, useV1RequestIdentityLink } from '@/hooks/use-v1-api';

/**
 * "이 경기에 뛰었는데 내 기록이 없나요?" (Task 154 P0-5, 사용자 선택 B안).
 *
 * 라인업에 이름만 올라가고 계정이 연결되지 않으면 그 경기는 선수의 활동 기록에
 * 영영 잡히지 않는다. 라인업이 마감된 뒤에는 매니저도 되돌릴 수 없어서, 예전에는
 * 운영 문의 말고 방법이 없었다.
 *
 * ## 왜 배너 → 모달인가 (A안: 라인업 행 인라인 버튼 대신)
 * 인라인 버튼은 맥락이 가장 가깝지만 **남의 이름 옆에도 "저예요" 버튼이 붙는다**.
 * 아무나 누를 수 있게 보이는 것 자체가 잘못된 신호라, 선택을 모달 안으로 넣어
 * "내 기록이 없다"는 증상에서 출발하게 했다.
 *
 * ## 안전장치는 서버에 있다
 * 신청은 확정이 아니다. `requestIdentityLink` 는 append-only 원장에 요청만 남기고,
 * "신청자 ≠ 확인자" 규칙(서비스 + DB 트리거)이 혼자서 연결을 완성하는 것을 막는다.
 * 이 화면은 그 요청을 만드는 입구일 뿐이다.
 */
export function ClaimMyRecordSection({
  tournamentId,
  fixtureId,
}: {
  tournamentId: string;
  fixtureId: string;
}) {
  const [open, setOpen] = useState(false);
  // 목록 조회 자체가 인가(참가팀 멤버)를 태우므로, 모달을 열기 전에는 부르지 않는다 --
  // 관전자가 이 페이지를 열 때마다 403 을 만들 이유가 없다.
  const claimable = useV1ClaimableParticipants(tournamentId, fixtureId, { enabled: open });
  const request = useV1RequestIdentityLink(tournamentId, fixtureId);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 신청이 끝나면 배너를 접는다. 같은 경기에 두 번 신청할 이유가 없고, 남겨 두면
  // "아직 안 됐나?" 하고 다시 누르게 된다.
  if (done) {
    return (
      <Card pad={16} style={{ marginTop: 10 }}>
        <div className="tm-text-body-lg">연결을 신청했어요</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
          다른 참가자의 확인을 거쳐 연결돼요. 확인되면 내 활동 기록에 이 경기가 표시돼요.
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card pad={16} style={{ marginTop: 10, borderStyle: 'dashed' }}>
        <div className="tm-text-body-lg">이 경기에 뛰었는데 내 기록이 없나요?</div>
        <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
          명단에서 본인을 찾아 연결하면 내 활동 기록으로 가져올 수 있어요.
        </div>
        <button
          type="button"
          className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
          style={{ marginTop: 12, minHeight: 44 }}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          명단에서 나 찾기
        </button>
      </Card>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(25, 31, 40, 0.48)' }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="claim-my-record-title"
            tabIndex={-1}
            className="w-full max-w-[420px] overflow-hidden rounded-2xl"
            style={{ background: 'var(--surface, #fff)', boxShadow: 'var(--shadow-modal)', padding: 20 }}
          >
            <div id="claim-my-record-title" className="tm-text-heading">
              명단에서 본인을 골라 주세요
            </div>
            <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)' }}>
              이미 계정이 연결된 참가자는 목록에 없어요. 신청 후 다른 참가자의 확인을 거쳐 연결돼요.
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {claimable.isLoading ? (
                <div className="tm-text-caption">불러오는 중이에요…</div>
              ) : claimable.isError ? (
                <div className="tm-text-caption" style={{ color: 'var(--red700)' }}>
                  {extractErrorMessage(claimable.error, '명단을 불러오지 못했어요.')}
                </div>
              ) : (claimable.data?.participants.length ?? 0) === 0 ? (
                // 0건은 "연결할 게 없다"는 정상 상태다. 이 경기의 참가자가 전부 이미
                // 연결돼 있다는 뜻이므로 에러처럼 보이게 하지 않는다.
                <div className="tm-text-caption">
                  연결되지 않은 참가자가 없어요. 이 경기 명단은 모두 계정에 연결돼 있어요.
                </div>
              ) : (
                claimable.data?.participants.map((participant) => (
                  <button
                    key={participant.participantId}
                    type="button"
                    className={`tm-btn tm-btn-md ${selected === participant.participantId ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
                    style={{ minHeight: 44, justifyContent: 'flex-start' }}
                    aria-pressed={selected === participant.participantId}
                    onClick={() => setSelected(participant.participantId)}
                  >
                    {participant.jerseyNumber !== null ? `${participant.jerseyNumber}. ` : ''}
                    {participant.displayName}
                  </button>
                ))
              )}
            </div>

            {error ? (
              <div role="alert" className="tm-text-caption" style={{ marginTop: 10, color: 'var(--red700)' }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="tm-btn tm-btn-md tm-btn-neutral"
                style={{ flex: 1, minHeight: 44 }}
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="tm-btn tm-btn-md tm-btn-primary"
                style={{ flex: 1, minHeight: 44 }}
                disabled={selected === null || request.isPending || claimable.data === undefined}
                onClick={() => {
                  if (selected === null || claimable.data === undefined) return;
                  setError(null);
                  request.mutate(
                    {
                      gameId: claimable.data.gameId,
                      participantId: selected,
                      // 서버가 낙관적 동시성으로 요구하는 값. 목록과 같은 시점의 버전을
                      // 그대로 보낸다 -- 그 사이 경기가 바뀌었으면 서버가 409 로 끊는다.
                      expectedVersion: claimable.data.version,
                    },
                    {
                      onSuccess: () => {
                        setOpen(false);
                        setDone(true);
                      },
                      onError: (mutationError) =>
                        setError(extractErrorMessage(mutationError, '신청하지 못했어요. 잠시 후 다시 시도해 주세요.')),
                    },
                  );
                }}
              >
                {request.isPending ? '신청 중' : '이 선수가 저예요'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
