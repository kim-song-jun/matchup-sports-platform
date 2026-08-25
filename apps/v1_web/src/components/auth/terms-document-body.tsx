/**
 * 약관 문서 본문 — 사용자 화면(terms-client)과 어드민 미리보기(admin/terms)가
 * 같은 마크업을 쓰는 단일 소스.
 *
 * 어드민 미리보기가 "실제 본문 미리보기"라 표기하면서 실제 사용자 렌더와 다른
 * 타이포그래피(text-sm leading-7 vs tm-text-caption 1.65 + pre-line)를 그려
 * 운영자에게 잘못된 확신을 주던 결함의 수정이다 — 클래스를 복사하는 대신
 * 컴포넌트를 공유해 앞으로도 어긋날 수 없게 한다.
 *
 * 사용자 화면은 제목(h1)을 데이터 도착 전에도 그리므로 "부제 + 본문 카드"가
 * 실제 공유 단위다. 어드민 미리보기는 제목까지 포함한 전체를 쓴다.
 */

/** 부제 + 본문 soft card — terms-client의 managedDocument 렌더와 동일 마크업 */
export function TermsDocumentSubtitleAndCard({
  subtitle,
  content,
}: {
  subtitle?: string | null;
  content: string;
}) {
  return (
    <>
      {subtitle ? <p className="tm-text-body tm-auth-sub">{subtitle}</p> : null}
      <div className="tm-auth-soft-card" style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <p className="tm-text-caption" style={{ margin: 0, lineHeight: 1.65, whiteSpace: 'pre-line' }}>
          {content}
        </p>
      </div>
    </>
  );
}

/**
 * 제목 포함 전체 — 어드민 미리보기용.
 * 사용자 화면에선 이 제목이 문서의 h1이지만, 어드민 페이지는 AdminPageHeader가 이미
 * h1을 그리므로 여기선 h2로 내린다(시각은 동일 클래스) — h1 중복 접근성 회귀 방지.
 */
export function TermsDocumentBody({
  title,
  subtitle,
  content,
}: {
  title: string;
  subtitle?: string | null;
  content: string;
}) {
  return (
    <>
      <h2 className="tm-text-heading tm-auth-heading">{title}</h2>
      <TermsDocumentSubtitleAndCard subtitle={subtitle} content={content} />
    </>
  );
}
