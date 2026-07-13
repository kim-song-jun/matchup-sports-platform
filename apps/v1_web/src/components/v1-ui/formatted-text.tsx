'use client';

/**
 * 어드민이 입력한 장문 플레인 텍스트(공지 본문·대회 규정·환불 정책 등)를
 * 일관된 구조로 렌더링하는 공용 포매터.
 *
 * 파싱 규칙 (마크다운이 아님 — 운영자가 자연스럽게 쓰는 관습만 지원):
 * - 빈 줄       → 문단 구분
 * - "- " "• " "* " "· " 로 시작하는 줄 → 불릿 목록
 * - "1. " "1) " 같은 숫자 접두 줄     → 번호 목록 (입력한 번호 유지)
 * - "---" "___" "───" "***" 등 동일 문자 3회 이상 반복 줄 → 구분선(hr)
 * - "⸻"(U+2E3B, 일부 노트 앱이 "---" 입력을 자동 변환하는 삼중 엠대시) 한 글자 이상 반복 줄 → 구분선(hr)
 * - 그 외 연속 줄                     → 하나의 문단 (줄바꿈 유지)
 */

const HR_PATTERN = /^[ \t]*(?:([-_─*])(?:[ \t]*\1){2,}|⸻+)[ \t]*$/;

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: { num: string; text: string }[] }
  | { type: 'hr' };

function parseBlocks(text: string): Block[] {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let cur: Block | null = null;
  const flush = () => {
    if (cur) {
      blocks.push(cur);
      cur = null;
    }
  };

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = line.match(/^[-•*·]\s+(.+)$/);
    const ordered = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (HR_PATTERN.test(line)) {
      flush();
      blocks.push({ type: 'hr' });
    } else if (bullet) {
      if (cur?.type !== 'ul') {
        flush();
        cur = { type: 'ul', items: [] };
      }
      cur.items.push(bullet[1]);
    } else if (ordered) {
      if (cur?.type !== 'ol') {
        flush();
        cur = { type: 'ol', items: [] };
      }
      cur.items.push({ num: ordered[1], text: ordered[2] });
    } else {
      if (cur?.type !== 'p') {
        flush();
        cur = { type: 'p', lines: [] };
      }
      cur.lines.push(line);
    }
  }
  flush();
  return blocks;
}

export function FormattedText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const blocks = parseBlocks(text);

  return (
    <div className={`tm-fmt-text${className ? ` ${className}` : ''}`} style={style}>
      {blocks.map((block, i) => {
        if (block.type === 'p') {
          return (
            <p key={i} className="tm-fmt-p">
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="tm-fmt-list">
              {block.items.map((item, j) => (
                <li key={j} className="tm-fmt-li">
                  <span className="tm-fmt-marker" aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'hr') {
          return <hr key={i} className="tm-fmt-hr" aria-hidden="true" />;
        }
        return (
          <ol key={i} className="tm-fmt-list">
            {block.items.map((item, j) => (
              <li key={j} className="tm-fmt-li">
                <span className="tm-fmt-num" aria-hidden="true">{item.num}.</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}
