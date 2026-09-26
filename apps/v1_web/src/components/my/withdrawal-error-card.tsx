import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { getWithdrawalErrorGuidance } from './withdrawal-guidance';

export function WithdrawalErrorCard({ error }: { error: unknown }) {
  const guidance = getWithdrawalErrorGuidance(error);

  return (
    <Card pad={16} className="tm-auth-soft-card-error">
      <div role="alert">
        <div className="tm-text-label">{guidance.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 6 }}>{guidance.message}</div>
      </div>
      <p className="tm-text-caption" style={{ margin: '12px 0 0', lineHeight: 1.6 }}>
        앱에서 바로 요청할 수 없다면 공개 계정 삭제 안내에서 이메일로 삭제를 요청할 수 있어요.
      </p>
      <Link className="tm-btn tm-btn-md tm-btn-outline tm-btn-block" href="/account-deletion" style={{ marginTop: 12 }}>
        계정 삭제 요청 방법 보기
      </Link>
    </Card>
  );
}
