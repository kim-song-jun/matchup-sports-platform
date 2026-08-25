'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import {
  useV1ClaimableParticipants,
  useV1LeagueClaimableParticipants,
  useV1LeagueRequestIdentityLink,
  useV1RequestIdentityLink,
} from '@/hooks/use-v1-api';

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
 *
 * ## 대회·리그 공용 (2026-08-25 대회 패리티 후속)
 * 화면·문구·신청 API 는 소스 불문 동일하고 **목록 훅만** 도메인이 다르다 — 그래서
 * 훅 호출부만 얇은 래퍼(`ClaimMyRecordSection`/`LeagueClaimMyRecordSection`)로 갈라
 * 두고 본문은 `ClaimMyRecordView` 하나를 공유한다(영상 등록 폼 공용화와 같은 구조).
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
  return <ClaimMyRecordView open={open} onOpenChange={setOpen} claimable={claimable} request={request} />;
}

/** 리그 경기 상세용 — 목록만 리그 스코프 API 를 쓰고 나머지는 대회와 동일하다. */
export function LeagueClaimMyRecordSection({
  leagueId,
  teamMatchId,
}: {
  leagueId: string;
  teamMatchId: string;
}) {
  const [open, setOpen] = useState(false);
  const claimable = useV1LeagueClaimableParticipants(leagueId, teamMatchId, { enabled: open });
  const request = useV1LeagueRequestIdentityLink(leagueId, teamMatchId);
  return <ClaimMyRecordView open={open} onOpenChange={setOpen} claimable={claimable} request={request} />;
}

function ClaimMyRecordView({
  open,
  onOpenChange,
  claimable,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimable: ReturnType<typeof useV1ClaimableParticipants>;
  request: ReturnType<typeof useV1RequestIdentityLink>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // alpha 실화면(2026-08-24)에서 잡은 것: 고를 참가자가 0명인데 "이 선수가 저예요"
  // 버튼이 그대로 남아 있었다. disabled 라도 회색 버튼이 보이면 "누를 수 있을 것 같은"
  // 신호를 주고, 사용자는 왜 안 눌리는지 찾게 된다. 아무것도 할 수 없는 상태에서는
  // 그 버튼을 아예 렌더하지 않고 닫기만 남긴다.
  const loaded = claimable.data !== undefined;
  const hasCandidates = (claimable.data?.participants.length ?? 0) > 0;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

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
            onOpenChange(true);
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
            if (event.target === event.currentTarget) onOpenChange(false);
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
            {/*
              제목과 안내는 목록 상태를 따라간다. 고를 것이 없는 화면이 "골라 주세요"라고
              말하면 사용자는 자기가 뭘 잘못했는지 찾게 된다 -- 실제로 alpha 실화면에서
              그렇게 읽혔다. 0건은 정상 상태이므로 결론을 먼저 말하고, 그래도 기록이
              안 보이는 진짜 원인(공개 동의)으로 이어 준다.
            */}
            {loaded && !hasCandidates ? (
              <>
                <div id="claim-my-record-title" className="tm-text-heading">
                  연결할 참가자가 없어요
                </div>
                <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                  이 경기 명단은 모두 계정에 연결돼 있어요. 그런데도 내 기록이 안 보인다면{' '}
                  {/* 인라인 텍스트 링크 관례는 auth-page 와 같은 --blue700. 밑줄은
                      "컬러만으로 정보 전달 금지" 규칙 때문에 함께 둔다. */}
                  <Link
                    href="/my/settings/record-consent"
                    style={{ color: 'var(--blue700)', textDecoration: 'underline' }}
                  >
                    기록 공개 설정
                  </Link>
                  을 확인해 주세요.
                </div>
              </>
            ) : (
              <>
                <div id="claim-my-record-title" className="tm-text-heading">
                  명단에서 본인을 골라 주세요
                </div>
                <div className="tm-text-caption" style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                  이미 계정이 연결된 참가자는 목록에 없어요. 신청 후 다른 참가자의 확인을 거쳐 연결돼요.
                </div>
              </>
            )}

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {claimable.isLoading ? (
                <div className="tm-text-caption">불러오는 중이에요…</div>
              ) : claimable.isError ? (
                <div className="tm-text-caption" style={{ color: 'var(--red700)' }}>
                  {extractErrorMessage(claimable.error, '명단을 불러오지 못했어요.')}
                </div>
              ) : !hasCandidates ? (
                // 0건 안내는 제목·부제가 이미 하고 있다. 여기서 한 번 더 말하면 같은
                // 문장이 한 화면에 두 번 뜬다.
                null
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
                className={`tm-btn tm-btn-md ${loaded && !hasCandidates ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
                style={{ flex: 1, minHeight: 44 }}
                onClick={() => onOpenChange(false)}
              >
                {loaded && !hasCandidates ? '닫기' : '취소'}
              </button>
              {loaded && !hasCandidates ? null : (
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
                        onOpenChange(false);
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
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
