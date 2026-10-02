import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function AdminPageHeader({ eyebrow, title, description, action }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-6 md:mb-7">
      {/* 제목 칸에 최소 폭을 주고 행을 wrap 가능하게 둔다. 그래야 좁은 화면에서 넓은
          action(상태 뱃지 + 버튼 등)이 제목을 눌러 뭉개는 대신 아래 줄로 내려간다 —
          390px alpha 실측: 리그 상세의 긴 리그 이름 칸이 110px 로 눌려 네 줄로 쪼개졌다.
          제목이 짧고 action 이 좁은 화면들은 합이 한 줄에 들어가므로 지금 배치 그대로다. */}
      <div className="min-w-[220px] flex-1">
        {/* eyebrow 는 12px 라 큰 글씨 완화(3:1)를 못 받는다 — --blue500 은 흰 지면에서
            3.71:1 로 AA 미달이고 --blue700 이 5.41:1 이다(alpha 실측 2026-09-08). */}
        {eyebrow && (
          <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)] tracking-normal mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[length:var(--font-size-subhead)] md:text-[length:var(--font-size-heading)] font-bold text-[var(--text-strong)]">{title}</h1>
        {description && (
          <p className="text-[length:var(--font-size-label)] md:text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] mt-1">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
