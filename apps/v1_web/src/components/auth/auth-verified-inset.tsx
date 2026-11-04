/** 인증이 끝났다는 한 줄 알림 — 파란 점 + 문구(색만으로 알리지 않는다). 가입의 휴대폰 인증과 이메일 로그인 연결이 같이 쓴다. */
export function AuthVerifiedInset({ message }: { message: string }) {
  return (
    <div
      className="tm-auth-inset tm-on-tint"
      role="status"
      style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--blue50)' }}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: 'var(--blue500)', display: 'inline-block' }}
      />
      <span className="tm-text-label" style={{ color: 'var(--blue700)' }}>{message}</span>
    </div>
  );
}
