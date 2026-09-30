'use client';

import { useState } from 'react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { usePublicUserRecords } from '@/components/public-game-records/use-public-game-records';
import { UserRecordRow } from '@/components/public-game-records/user-records-content';
import { buildRecordExposureRows } from '@/components/public-game-records/record-consent-preview';

/**
 * 경기 기록 공개 동의에 **처음** 답하는 화면 (Task 180 G9, 사용자 선택 A안).
 *
 * 토글 한 줄만 있던 설정 화면은 "무엇이 공개되는지"를 말하지 않아 정보 없는 동의였다. 여기서는
 * 공개를 기다리는 내 실제 기록과, 공개하면 그 기록이 나타나는 곳을 먼저 보여 준 뒤 같은 자리에서
 * 답하게 한다. 서버가 이미 주는 본인 조회(`GET /users/:me/records`, 동의 전에도 items 가 온다)만
 * 쓰므로 동의용 API 는 따로 없다.
 *
 * "공개 안 함"은 서버에 응답을 남겨(REVOKED) 홈 배너를 영구히 끈다. 화면을 그냥 나가는 것은
 * 아무것도 저장하지 않는다(다음 새 경기에 배너가 다시 뜬다).
 */
export function RecordConsentFirstAnswer({
  pendingCount,
  saving,
  error,
  onAnswer,
}: {
  /** 서버가 계산한 "지금 켜면 공개될 경기 수". 1 이상일 때만 이 화면을 쓴다. */
  pendingCount: number;
  saving: boolean;
  error: boolean;
  onAnswer: (granted: boolean) => void;
}) {
  const authMe = useV1AuthMe();
  const userId = authMe.data?.user.id ?? '';
  const records = usePublicUserRecords(userId);
  const [pressed, setPressed] = useState<boolean | null>(null);
  const firstPage = records.data?.pages[0];
  const failed = authMe.isError || records.isError;

  const answer = (granted: boolean) => {
    setPressed(granted);
    onAnswer(granted);
  };

  return (
    <>
      {error ? (
        <Card pad={16} className="tm-auth-soft-card-warning" style={{ marginBottom: 8 }}>
          <div className="tm-text-label" style={{ color: 'var(--orange700)' }}>저장하지 못했어요</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>잠시 후 다시 시도해 주세요.</div>
        </Card>
      ) : null}
      <section>
        <div className="tm-my-section-label">공개를 기다리는 기록 · {pendingCount}경기</div>
        {failed ? (
          <ErrorState
            message="기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            onRetry={() => void (authMe.isError ? authMe.refetch() : records.refetch())}
          />
        ) : firstPage === undefined ? (
          <div className="tm-skeleton" style={{ height: 96, marginTop: 8, borderRadius: 'var(--radius-control)' }} />
        ) : (
          <>
            <Card pad={0} style={{ marginTop: 8 }}>
              {firstPage.items.map((item) => (
                <UserRecordRow key={item.id} item={item} privateBadge />
              ))}
            </Card>
            {records.hasNextPage ? (
              <div className="tm-text-caption tm-my-settings-footnote">
                최근 {firstPage.items.length}경기만 보여드려요. 나머지 경기도 함께 공개돼요.
              </div>
            ) : null}
          </>
        )}
      </section>
      {firstPage === undefined ? null : (
        <section style={{ marginTop: 20, paddingBottom: 'var(--v1-shell-safe-bottom)' }}>
          <div className="tm-my-section-label">공개하면 이렇게 보여요</div>
          <Card pad={0} style={{ marginTop: 8 }}>
            {buildRecordExposureRows(firstPage.summary, firstPage.nickname).map((row, index) => (
              <div
                key={row.key}
                style={{ padding: '12px 16px', borderTop: index === 0 ? undefined : '1px solid var(--grey100)' }}
              >
                <div className="tm-text-label">{row.title}</div>
                <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-body)' }}>{row.example}</div>
              </div>
            ))}
          </Card>
          <div className="tm-text-caption tm-my-settings-footnote">
            이름은 닉네임으로 나와요. 팀 라인업에 내 계정으로 연결된 경기만 해당돼요. 지금까지 참가한 경기도 함께 공개돼요.
          </div>
        </section>
      )}
      <div className="tm-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" disabled={saving} onClick={() => answer(false)}>
            공개 안 함
          </button>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-primary" disabled={saving} onClick={() => answer(true)}>
            {saving && pressed === true ? '저장하는 중…' : `${pendingCount}경기 공개하기`}
          </button>
        </div>
        <p className="tm-text-caption" style={{ margin: '8px 0 0', textAlign: 'center' }}>
          언제든 설정에서 바꿀 수 있어요. 끄면 바로 모두 비공개로 돌아가요.
        </p>
      </div>
    </>
  );
}
