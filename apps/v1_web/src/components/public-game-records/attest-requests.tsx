'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { hasStoredV1Session } from '@/lib/session-storage';
import {
  useV1AttestIdentityLink,
  useV1AuthMe,
  useV1PendingIdentityLinkRequests,
} from '@/hooks/use-v1-api';

/**
 * 기록 연결 승인함 (attest UI C안, 2026-08-26).
 *
 * claim(claim-my-record.tsx)이 만든 신원 연결 **요청**을 다른 참가자가 확인·승인하는
 * 반대쪽 절반이다 — 이 화면이 없어서 신청은 쌓이는데 연결이 완성되지 않았다(승인 API 만
 * 존재, 소비처 0). 알림(신청 시 발송)의 착지 화면이기도 하다.
 *
 * ## 노출 규칙
 * - 로그인 + 승인 자격이 있고 + 대기 중 요청이 1건 이상일 때만 카드가 보인다.
 *   그 외(비로그인/관전자 403/0건)는 조용히 아무것도 렌더하지 않는다 — 승인은 "요청이
 *   있을 때 생기는 할 일"이라 빈 카드를 상시 노출할 이유가 없다.
 * - 목록 API 가 "내가 승인할 수 있는 요청"만 돌려주므로(서버 필터), 여기 뜬 행은 전부
 *   실제로 처리할 수 있다.
 *
 * ## 안전장치는 서버에 있다
 * "신청자 ≠ 확인자" 규칙(서비스 + DB 트리거)과 24시간 만료는 서버가 강제한다. 이 화면은
 * 결정(승인/거절)을 전달하는 입구일 뿐이다.
 */
export function AttestRequestsSection({ gameId }: { gameId: string | null | undefined }) {
  // 비로그인 관전자가 페이지를 열 때마다 401 을 만들 이유가 없다 — 로컬 세션 힌트가
  // 있을 때만 /auth/me probe 를 보내고(힌트 없이 probe 부터 나가면 그 자체가 401 소음
  // — Copilot 리뷰), 세션이 확인된 뒤에만 승인함을 조회한다. 힌트는 SSR 하이드레이션
  // 불일치를 피하려고 effect 에서 읽는다(tournament-detail-client 와 같은 패턴).
  const [hasSessionHint, setHasSessionHint] = useState(false);
  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, []);
  const me = useV1AuthMe({ enabled: hasSessionHint, retry: false });
  const pending = useV1PendingIdentityLinkRequests(gameId, {
    enabled: hasSessionHint && me.data !== undefined,
  });
  const attest = useV1AttestIdentityLink(gameId);
  const [error, setError] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<string | null>(null);
  const [decidingRequestId, setDecidingRequestId] = useState<string | null>(null);

  const requests = pending.data?.requests ?? [];
  // 403(관전자·자격 없음)은 정상 상태라 조용히 숨긴다. 그 외 오류(5xx·네트워크)를 함께
  // 숨기면 장애가 "승인할 요청 없음"으로 위장되므로 최소한의 오류 문구는 드러낸다
  // (Copilot 리뷰 — 리그 경기 상세의 404 vs 그 외 처리와 같은 원칙).
  const isSpectatorDenied =
    pending.error instanceof V1ApiError &&
    (pending.error.statusCode === 403 || pending.error.statusCode === 401);
  if (pending.isError && !isSpectatorDenied) {
    return (
      <Card pad={16} style={{ marginTop: 12 }}>
        <div className="tm-text-body-lg">기록 연결 승인 요청</div>
        <div role="alert" className="tm-text-caption" style={{ marginTop: 4, color: 'var(--red700)' }}>
          {extractErrorMessage(pending.error, '승인 요청을 불러오지 못했어요.')}
        </div>
      </Card>
    );
  }
  if (pending.data === undefined || (requests.length === 0 && lastDecision === null)) {
    return null;
  }

  const decide = (
    request: (typeof requests)[number],
    decision: 'approve' | 'reject',
  ) => {
    if (pending.data === undefined) return;
    setError(null);
    setDecidingRequestId(request.requestId);
    attest.mutate(
      {
        participantId: request.participantId,
        requestId: request.requestId,
        decision,
        // 목록과 같은 시점의 버전 — 그 사이 경기가 바뀌었으면 서버가 409 로 끊고,
        // invalidate 로 목록을 다시 불러온다.
        expectedVersion: pending.data.version,
      },
      {
        onSuccess: () => {
          setLastDecision(
            decision === 'approve'
              ? `"${request.participantDisplayName}" 기록을 연결했어요.`
              : `"${request.participantDisplayName}" 연결 요청을 거절했어요.`,
          );
        },
        onError: (mutationError) =>
          setError(extractErrorMessage(mutationError, '처리하지 못했어요. 잠시 후 다시 시도해 주세요.')),
        onSettled: () => setDecidingRequestId(null),
      },
    );
  };

  return (
    <Card pad={16} style={{ marginTop: 12 }}>
      <div className="tm-text-body-lg">기록 연결 승인 요청</div>
      <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
        명단의 이름과 신청한 사람이 같은 선수인지 확인해 주세요. 요청은 24시간 뒤 만료돼요.
      </div>

      {lastDecision ? (
        <div role="status" className="tm-text-caption" style={{ marginTop: 12, color: 'var(--text-strong)' }}>
          {lastDecision}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="tm-text-caption" style={{ marginTop: 12, color: 'var(--red700)' }}>
          {error}
        </div>
      ) : null}

      <ul style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0 }}>
        {requests.map((request) => (
          <li
            key={request.requestId}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}
          >
            <div className="tm-text-body">
              {request.jerseyNumber !== null ? `${request.jerseyNumber}. ` : ''}
              {request.participantDisplayName}
              <span className="tm-text-caption" style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
                신청: {request.requesterNickname ?? '알 수 없음'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="tm-btn tm-btn-md tm-btn-primary"
                style={{ flex: 1, minHeight: 44 }}
                disabled={attest.isPending}
                aria-label={`${request.participantDisplayName} 연결 승인`}
                onClick={() => decide(request, 'approve')}
              >
                {attest.isPending && decidingRequestId === request.requestId ? '처리 중' : '본인이 맞아요'}
              </button>
              <button
                type="button"
                className="tm-btn tm-btn-md tm-btn-neutral"
                style={{ flex: 1, minHeight: 44 }}
                disabled={attest.isPending}
                aria-label={`${request.participantDisplayName} 연결 거절`}
                onClick={() => decide(request, 'reject')}
              >
                아니에요
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
