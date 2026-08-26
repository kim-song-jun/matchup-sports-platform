'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Instagram, Mail, MessageCircleQuestion } from 'lucide-react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { isUnauthenticatedError } from '@/lib/api-client';
import { getCurrentRedirectPath, getLoginPathForRedirect } from '@/lib/session-storage';
import { TournamentInquiryModal } from './tournament-inquiry-modal';
import styles from './tournament-inquiry-section.module.css';

const TOURNAMENT_CONTACT = {
  instagramHandle: '@teameet_official',
  instagramUrl: 'https://www.instagram.com/teameet_official/',
  email: 'teameetsports@naver.com',
} as const;

type TournamentInquirySectionProps = {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
};

export function TournamentInquirySection({
  tournamentId,
  tournamentTitle,
}: TournamentInquirySectionProps) {
  const router = useRouter();
  const authMe = useV1AuthMe({ retry: false });
  const isGuest = authMe.isError && isUnauthenticatedError(authMe.error);
  const hasSessionError = authMe.isError && !isGuest;
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <section aria-label="대회 문의" className={styles.section}>
      <button
        type="button"
        onClick={() => {
          if (isGuest) {
            router.push(getLoginPathForRedirect(getCurrentRedirectPath()));
            return;
          }
          if (authMe.data) setOpen(true);
        }}
        disabled={authMe.isPending || authMe.isFetching || hasSessionError}
        className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <MessageCircleQuestion size={18} aria-hidden="true" />
        {authMe.isPending || authMe.isFetching ? '로그인 확인 중...' : isGuest ? '로그인 후 문의하기' : '문의하기'}
      </button>
      <p className={styles.memberNotice}>대회 문의는 회원가입 후 로그인한 사용자만 접수할 수 있어요.</p>

      <div className={styles.contactList} aria-label="대회 문의 연락처">
        <a href={TOURNAMENT_CONTACT.instagramUrl} target="_blank" rel="noreferrer" className={styles.contactItem}>
          <Instagram size={18} aria-hidden="true" />
          <span>인스타그램</span>
          <strong>{TOURNAMENT_CONTACT.instagramHandle}</strong>
        </a>
        <a href={`mailto:${TOURNAMENT_CONTACT.email}`} className={styles.contactItem}>
          <Mail size={18} aria-hidden="true" />
          <span>이메일</span>
          <strong>{TOURNAMENT_CONTACT.email}</strong>
        </a>
      </div>

      {open ? (
        <TournamentInquiryModal
          tournamentId={tournamentId}
          tournamentTitle={tournamentTitle}
          authUser={authMe.data ?? null}
          isSessionChecking={authMe.isPending || authMe.isFetching}
          hasSessionError={hasSessionError}
          onRetrySession={() => authMe.refetch()}
          onClose={() => setOpen(false)}
          onSubmitted={() => {
            setOpen(false);
            setToast('문의가 접수됐어요. 운영팀 확인 후 답변드릴게요.');
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'max(24px, env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            background: 'var(--text-strong)',
            color: 'var(--static-white)',
            padding: '12px 20px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      ) : null}
    </section>
  );
}
