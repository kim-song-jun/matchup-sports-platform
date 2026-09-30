import { useEffect, useState } from 'react';
import { useV1RecordConsent, useV1UpdateRecordConsent } from '@/hooks/use-v1-api';
import { usePublicUserRecords } from '@/components/public-game-records/use-public-game-records';
import { appearsInRanking, describePendingRecord } from '@/components/public-game-records/record-consent-preview';
import { RECORD_CONSENT_POLICY_HASH } from '@/lib/record-consent';
import {
  dismissRecordConsentNudge,
  lowerRecordConsentNudgeDismissal,
  shouldShowRecordConsentNudge,
} from '@/lib/session-storage';
import type { HomeViewModel } from './home.types';

/**
 * 경기 기록 공개 동의 홈 배너 (Task 154 P0-3 → Task 180 G9).
 *
 * ## 언제 뜨나
 * 켜도 아무것도 안 보이는 사람에게 조르면 켜고 나서 화면이 그대로라 신뢰만 잃는다. 그래서 서버가
 * 계산한 `pendingRecordCount`(지금 켜면 공개될 경기 수)가 1 이상일 때만 뜬다.
 *
 * ## 언제 다시 뜨나 / 언제 영영 안 뜨나
 * - **X(넘기기)** 는 "지금 대기 중인 경기들만 넘김"이다. 넘긴 뒤 공개를 기다리는 경기가 새로 생기면
 *   다시 뜬다(브라우저에 기억 -- `lib/session-storage.ts`).
 * - **"공개 안 함"** 은 설정 화면에서 서버에 응답을 남긴다(`hasResponded`). 그 사람만 영구히 안 뜬다.
 *   응답 기록이 없는 "아직 안 물어봄"과 구분하려고 `granted:false` 가 아니라 `hasResponded` 를 본다.
 *
 * 배너 안에 내 기록 한 줄을 보여 주므로(무엇이 공개되는지 모르는 동의를 막는다) 그 조회가 끝난 뒤에
 * 뜬다. 조회가 실패해도 배너는 기록 한 줄 없이 뜬다.
 */
export function useRecordConsentNudge({
  enabled,
  userId,
}: {
  enabled: boolean;
  userId: string | null;
}): HomeViewModel['recordConsentNudge'] {
  const consent = useV1RecordConsent();
  const updateConsent = useV1UpdateRecordConsent();
  // 브라우저 저장소는 서버 렌더에 없다 -- 마운트 뒤에만 읽어야 하이드레이션이 어긋나지 않는다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const pendingCount = consent.data?.pendingRecordCount ?? 0;
  // 옛 서버 응답에는 `hasResponded` 가 없다 -- 그때는 판단 근거가 없으므로 띄우지 않는다.
  const candidate =
    enabled && userId !== null && consent.data?.hasResponded === false && pendingCount > 0;

  useEffect(() => {
    if (candidate && userId !== null) lowerRecordConsentNudgeDismissal(userId, pendingCount);
  }, [candidate, userId, pendingCount]);

  const visible =
    mounted &&
    candidate &&
    userId !== null &&
    (dismissedAt === null || pendingCount > dismissedAt) &&
    shouldShowRecordConsentNudge(userId, pendingCount);

  const records = usePublicUserRecords(visible && userId !== null ? userId : '');
  if (!visible || userId === null || !(records.isSuccess || records.isError)) return undefined;

  const firstPage = records.data?.pages[0];
  const latest = firstPage?.items[0];
  return {
    pendingCount,
    latestRecord: latest === undefined ? undefined : describePendingRecord(latest),
    mentionsRanking: firstPage !== undefined && appearsInRanking(firstPage.summary),
    saving: updateConsent.isPending,
    onGrant: () => {
      updateConsent.mutate({ granted: true, policyHash: RECORD_CONSENT_POLICY_HASH });
    },
    onDismiss: () => {
      dismissRecordConsentNudge(userId, pendingCount);
      setDismissedAt(pendingCount);
    },
  };
}
