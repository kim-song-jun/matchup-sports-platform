import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface AdminEmptyProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * 조회 실패를 이 컴포넌트로 그리는 소비처가 있다 — 그때는 role="alert" 를 줘서 스크린리더가
   * "빈 목록"이 아니라 오류로 읽게 한다. 기본값 없음(빈 상태는 역할을 얹지 않는다).
   */
  role?: 'alert' | 'status';
}

export function AdminEmpty({ icon, title, description, action, role }: AdminEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-center px-5" role={role}>
      <span className="text-gray-300 dark:text-gray-600 mb-1" aria-hidden="true">
        {icon ?? <Inbox size={40} />}
      </span>
      <p className="tm-text-body font-semibold [color:var(--text-muted)]">{title}</p>
      {description && <p className="tm-text-caption">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
