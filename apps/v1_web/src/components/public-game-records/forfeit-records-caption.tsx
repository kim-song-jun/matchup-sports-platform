import { Info } from 'lucide-react';
import { FORFEIT_RECORDS_NOTE_DETAIL, FORFEIT_RECORDS_NOTE_SHORT } from '@/lib/match-outcome';

/**
 * 몰수 경기의 득점·카드 목록 머리에 붙는 한 줄 설명. 몰수 점수와 실제 개인 기록이 어긋나 보이는
 * 이유를 기록 바로 곁에서 말한다. 몰수가 아니거나 보여 줄 기록이 없으면 DOM 에 만들지 않는다.
 * 의미는 글자로 전하고 아이콘은 장식이다.
 */
export function ForfeitRecordsCaption({
  isForfeit,
  hasRecords,
  variant,
}: {
  isForfeit: boolean;
  hasRecords: boolean;
  variant: 'detail' | 'short';
}) {
  if (!isForfeit || !hasRecords) return null;
  const isDetail = variant === 'detail';
  return (
    <p
      style={{
        margin: isDetail ? '0 0 12px' : '8px 0 0',
        display: 'flex',
        gap: 6,
        alignItems: 'flex-start',
        justifyContent: isDetail ? 'flex-start' : 'center',
        fontSize: 'var(--font-size-caption)',
        fontWeight: isDetail ? 700 : 600,
        lineHeight: 1.5,
        // --orange500 은 흰 배경 위 텍스트로 쓰면 WCAG AA 미달이다.
        color: 'var(--orange700)',
        wordBreak: 'keep-all',
      }}
    >
      <Info size={isDetail ? 14 : 12} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{isDetail ? FORFEIT_RECORDS_NOTE_DETAIL : FORFEIT_RECORDS_NOTE_SHORT}</span>
    </p>
  );
}
