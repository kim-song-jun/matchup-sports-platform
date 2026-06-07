export function AdminErrorPanel({ message, onRetry }: { readonly message?: string; readonly onRetry?: () => void }) {
  return (
    <div className="tm-admin-error" role="alert">
      <div>
        <div className="tm-text-body-lg">운영 데이터를 불러오지 못했습니다</div>
        <div className="tm-text-caption">{message ?? '로그인 상태와 v1 운영 데이터를 확인한 뒤 다시 시도해 주세요.'}</div>
      </div>
      {onRetry ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={onRetry}>다시 시도</button> : null}
    </div>
  );
}
