'use client';

import { useEffect, useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { useV1AuthMe } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { TournamentInquiryModal } from './tournament-inquiry-modal';

type TournamentInquirySectionProps = {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
};

export function TournamentInquirySection({
  tournamentId,
  tournamentTitle,
}: TournamentInquirySectionProps) {
  const authMe = useV1AuthMe({ retry: false });
  const isGuest = authMe.error instanceof V1ApiError && authMe.error.statusCode === 401;
  const hasSessionError = authMe.isError && !isGuest;
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <section aria-label="대회 문의" style={{ marginTop: 24 }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <MessageCircleQuestion size={18} aria-hidden="true" />
        문의하기
      </button>

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
            padding: '13px 20px',
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
