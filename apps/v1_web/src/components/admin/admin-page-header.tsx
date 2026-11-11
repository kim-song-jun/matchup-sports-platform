import type { ReactNode } from 'react';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { AppBackLink } from '@/components/v1-ui/app-back-link';

interface AdminPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** 제목 왼쪽 뒤로가기 버튼. 스와이프와 같은 뒤로가기 규칙(AppBackLink)으로 간다. */
  back?: { fallbackHref: string; label: string };
}

export function AdminPageHeader({ eyebrow, title, description, action, back }: AdminPageHeaderProps) {
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
        <div className={back ? 'flex items-center gap-1 -ml-3' : undefined}>
          {back && (
            <AppBackLink
              fallbackHref={back.fallbackHref}
              label={back.label}
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]"
            >
              <ChevronLeftIcon size={24} strokeWidth={2} />
            </AppBackLink>
          )}
          <h1 className="text-[length:var(--font-size-subhead)] md:text-[length:var(--font-size-heading)] font-bold text-[var(--text-strong)]">{title}</h1>
        </div>
        {description && (
          <p className="text-[length:var(--font-size-label)] md:text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] mt-1">{description}</p>
        )}
      </div>
      {/* max-w-full: 버튼이 여러 개인 action 이 한 줄 폭(max-content)으로 굳어 390px 를 넘으면 페이지 전체가
          옆으로 넓어지고 모달까지 잘린다(2026-10-13 리그 상세 alpha 실측). 줄 폭으로 막아야 안쪽 flex-wrap 이 줄을 바꾼다. */}
      {action && <div className="max-w-full flex-shrink-0">{action}</div>}
    </div>
  );
}
