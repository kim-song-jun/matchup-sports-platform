import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

// 코드포인트가 아니라 사용자가 보는 글자 단위로 자른다 — 국기·ZWJ 이모지·분해형(NFD) 한글을 가운데서 가르지 않는다.
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * 이름·문장 속 링크(선수 공개 프로필, 팀 페이지, 안내 문장의 설정 링크). 밑줄 대신 글자
 * 뒤 chevron 이 "눌린다"는 신호이고, 색 말고도 링크임이 드러나는 단서(WCAG 1.4.1)다.
 * 득점·도움 순위 행과 시상대 카드가 쓰는 chevron 과 같은 아이콘·색이라 한 화면에서
 * 같은 언어로 읽힌다.
 *
 * `href` 가 `null` 이면 서버가 이 이름은 열 수 없다고 판단한 것이다(동의·계정 유무를
 * 여기서 다시 따지지 않는다). 그때는 의미 없는 래퍼 없이 글자만 돌려준다 — 대부분의
 * 참가자가 이 경우라 래퍼가 한 겹 늘면 기존 레이아웃(폭·정렬)이 미묘하게 달라진다.
 */
export function InlineChevronLink({
  href,
  label,
  tone = 'inherit',
  chevronSize = 14,
}: {
  href: string | null;
  label: string;
  /** `link` 는 주변 글자색과 구분이 필요한 문장 속 링크용(파란 글자). */
  tone?: 'inherit' | 'link';
  chevronSize?: 14 | 16;
}) {
  if (href === null) return <>{label}</>;
  // 마지막 글자를 chevron 과 한 덩어리로 묶는다 — 좁은 폭에서 chevron 만 다음 줄로 떨어지지 않는다.
  const graphemes = Array.from(graphemeSegmenter.segment(label), (part) => part.segment);
  const lead = graphemes.slice(0, -1).join('');
  const tail = graphemes.slice(-1).join('');
  return (
    <Link
      href={href}
      className="tm-inline-chevron-link"
      style={tone === 'link' ? { color: 'var(--blue700)' } : undefined}
    >
      {lead}
      {/* display:inline 는 브라우저 기본값이다 — jsdom 은 display 가 비어 있는 span 경계마다 접근성 이름에 공백을 넣는다. */}
      <span style={{ display: 'inline', whiteSpace: 'nowrap' }}>
        {tail}
        <ChevronRight
          size={chevronSize}
          aria-hidden="true"
          style={{ display: 'inline-block', verticalAlign: -2, marginLeft: 2, color: 'var(--grey500)' }}
        />
      </span>
    </Link>
  );
}
