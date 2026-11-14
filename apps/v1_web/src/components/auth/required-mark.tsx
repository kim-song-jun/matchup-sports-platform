/**
 * 필수 입력 표시. 별표는 장식(aria-hidden)이고 실제 의미는 sr-only 텍스트가 전달한다 —
 * 빨간 별 하나만 두면 색으로만 정보를 주게 되어 색각 이상·스크린리더 사용자에게는 사라진다.
 * 어드민 폼(admin/admins, tournaments/new)이 쓰는 표기와 같은 형태다.
 */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" style={{ marginLeft: 2, color: 'var(--red700)' }}>*</span>
      <span className="sr-only">(필수)</span>
    </>
  );
}

/**
 * 별표 안내 줄. 별표를 aria-hidden 으로만 두면 "표시는 필수 입력이에요"로 읽혀 무엇에 대한
 * 설명인지 사라진다. 시각 사용자는 기호로, 보조공학은 sr-only 단어로 같은 문장을 받게 한다.
 */
export function RequiredFieldsNote({ children = '표시는 필수 입력이에요.' }: { children?: string }) {
  return (
    <p className="tm-text-caption" style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>
      <span aria-hidden="true" style={{ color: 'var(--red700)' }}>*</span>
      <span className="sr-only">별표</span> {children}
    </p>
  );
}
