'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import type { CreateBarStatus } from './create-form-model';

function StatusMark({ status }: { status: CreateBarStatus }) {
  if (status.tone === 'todo') {
    return (
      <span
        aria-hidden="true"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--grey100)] text-[length:var(--font-size-caption)] font-bold text-[var(--text-body)]"
      >
        {status.count}
      </span>
    );
  }
  if (status.tone === 'ok') {
    return (
      <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--green50)] text-[var(--green700)]">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--red50)] text-[length:var(--font-size-caption)] font-bold text-[var(--red700)]"
    >
      !
    </span>
  );
}

/** 폼 하단에 붙는 상태 줄과 제출 버튼. 버튼은 비어 있어도 누를 수 있다 — 누르면 첫 빈칸·오류 칸으로 간다. */
export function CreateBottomBar({
  status,
  pending,
  cancelHref,
}: {
  status: CreateBarStatus;
  pending: boolean;
  cancelHref: string;
}) {
  return (
    <div
      role="region"
      aria-label="만들기"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card-surface)]/95 px-4 py-3 backdrop-blur lg:pl-[var(--admin-sidebar-width,0px)]"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <p
          role="status"
          className={[
            'flex min-w-0 items-center gap-2 text-[length:var(--font-size-label)] font-semibold',
            status.tone === 'error' ? 'text-[var(--red700)]' : 'text-[var(--text-body)]',
          ].join(' ')}
        >
          <StatusMark status={status} />
          <span className="min-w-0">{status.text}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {/* .tm-btn 이 display 를 직접 정해 자기 클래스로는 숨길 수 없어 감싸서 숨긴다. */}
          <div className="hidden sm:block">
            <Link href={cancelHref} className="tm-btn tm-btn-lg tm-btn-neutral">
              취소
            </Link>
          </div>
          <Button type="submit" variant="primary" size="lg" loading={pending}>
            {pending ? '만드는 중…' : '초안 만들기'}
          </Button>
        </div>
      </div>
    </div>
  );
}
