import { Bell } from 'lucide-react';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { NotificationTypeIcon } from '@/components/community/notification-visual';

/** Display examples only: no local notification, remote send, or target navigation. */
export function PushNotificationPreview({ title, body }: { title: string; body: string | null }) {
  return (
    <section className="min-w-0 space-y-4" aria-label="알림 표시 미리보기">
      <SectionTitle title="알림 미리보기" />
      <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        표시 예시예요. 기기·글자 크기·알림 설정에 따라 줄바꿈과 노출 내용이 달라져요.
      </p>
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h3 className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-muted)]">휴대폰 푸시</h3>
          <div className="tm-on-tint flex min-w-0 gap-3 rounded-2xl bg-[var(--surface-soft)] p-4" data-testid="phone-push-preview">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--blue500)] text-[var(--static-white)]" aria-hidden="true"><Bell size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">팀밋</p>
              <p className="mt-1 break-words text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]">{title}</p>
              {body && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[length:var(--font-size-label)] text-[var(--text-body)]">{body}</p>}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-muted)]">앱 알림함</h3>
          <div className="flex min-w-0 gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-4" data-testid="inbox-push-preview">
            <span className="mt-1 shrink-0 text-[var(--blue500)]" aria-hidden="true"><NotificationTypeIcon type="notice" /></span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-[length:var(--font-size-body)] font-semibold text-[var(--text-strong)]">{title}</p>
              {body && <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[length:var(--font-size-label)] text-[var(--text-body)]">{body}</p>}
              <p className="mt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">수신 시각 표시</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
