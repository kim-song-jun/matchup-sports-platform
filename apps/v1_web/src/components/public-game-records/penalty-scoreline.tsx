import { formatPenaltyScoreline } from './format';
import type { PublicScore, PublicScoreStatus } from './types';

/**
 * 스코어라인 바로 아래에 붙는 승부차기 보조 표기("승부차기 4-3").
 *
 * 일정 카드(`schedule-content.tsx`)와 경기 상세 헤더(`match-detail-content.tsx`)가
 * 같은 규칙으로 보여줘야 해서 한 컴포넌트로 묶었다 — 두 화면이 각자 인라인으로
 * 그리면 한쪽만 고쳐지는 드리프트가 난다.
 *
 * 승부차기가 없는 경기에서는 **아무것도 렌더하지 않는다**(빈 줄이나 '-'도 남기지
 * 않는다). 대부분의 경기가 이 경우라, 자리만 차지하는 빈 요소가 생기면 모든 일정
 * 카드의 리듬이 어긋난다.
 *
 * 색은 `var(--text-caption)`(globals.css의 라이트/다크 양쪽에 정의된 토큰)만 쓴다 —
 * 하드코딩 색을 쓰면 다크모드에서 대비가 깨진다. 정보를 색으로만 전달하지 않도록
 * "승부차기"라는 단어를 항상 함께 적는다.
 */
export function PenaltyScoreline({
  score,
  scoreStatus,
  fontSize = 'var(--font-size-micro)',
}: {
  score: PublicScore | null;
  scoreStatus: PublicScoreStatus;
  /** 일정 카드(11)보다 경기 상세 헤더(12)가 한 단계 크다 — 본 스코어의 크기 차이를 그대로 따른다. */
  fontSize?: number | string;
}) {
  const label = formatPenaltyScoreline(score, scoreStatus);
  if (label === null) return null;
  return (
    <div
      className="tab-num"
      style={{
        marginTop: 4,
        textAlign: 'center',
        fontSize,
        fontWeight: 600,
        color: 'var(--text-caption)',
      }}
    >
      {label}
    </div>
  );
}
