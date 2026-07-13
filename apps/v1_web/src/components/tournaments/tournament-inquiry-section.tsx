'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { TextField } from '@/components/v1-ui/primitives';
import { useV1CreateInquiry } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { hasStoredV1Session } from '@/lib/session-storage';

type InquiryFormErrors = Partial<Record<'title' | 'body' | 'guestContact' | 'form', string>>;

/**
 * TournamentInquirySection — 대회 상세 페이지의 "문의하기" CTA + 접수 모달.
 *
 * 기존 문의 시스템(`useV1CreateInquiry`, `/admin/inquiries`)을 그대로 재사용한다 —
 * category/relatedType/relatedId를 대회 문의로 고정해서 제출하는 것 외에 새 백엔드
 * 로직은 없다. 로그인 여부는 `hasStoredV1Session()`으로 판단하며, 비로그인일 때만
 * 이메일/전화번호 입력을 추가로 받는다(둘 중 최소 1개 필수 — 서버도 동일하게 검증).
 *
 * 로그인 판별은 lazy useState initializer로 첫 렌더부터 동기적으로 계산한다(effect로
 * 미루면 effect 실행 전에 모달을 여는 로그인 사용자가 게스트로 오판될 수 있음).
 */
export function TournamentInquirySection({ tournamentId }: { tournamentId: string }) {
  const [isLoggedIn] = useState(() => hasStoredV1Session());
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
        <InquiryModal
          tournamentId={tournamentId}
          isLoggedIn={isLoggedIn}
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
            color: '#fff',
            padding: '13px 20px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
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

function InquiryModal({
  tournamentId,
  isLoggedIn,
  onClose,
  onSubmitted,
}: {
  tournamentId: string;
  isLoggedIn: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const createInquiry = useV1CreateInquiry();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [errors, setErrors] = useState<InquiryFormErrors>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  // isPending 은 리렌더 이후에나 반영되므로, 같은 이벤트 루프 틱에서 두 번 눌리는
  // 극단적인 케이스(연타/마우스 더블클릭 버그 등)까지 막으려면 ref 기반 동기 락이 필요하다.
  const submitBusyRef = useRef(false);

  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, []);

  // body 스크롤 잠금 + 초기 포커스(첫 입력 필드)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const id = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus();
    }, 60);
    return () => {
      document.body.style.overflow = '';
      clearTimeout(id);
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBusyRef.current) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const trimmedEmail = guestEmail.trim();
    const trimmedPhone = guestPhone.trim();

    const nextErrors: InquiryFormErrors = {};
    if (!trimmedTitle) nextErrors.title = '문의 제목을 입력해 주세요.';
    if (!trimmedBody) nextErrors.body = '문의 내용을 입력해 주세요.';
    if (!isLoggedIn && !trimmedEmail && !trimmedPhone) {
      nextErrors.guestContact = '이메일 또는 전화번호 중 하나는 꼭 입력해 주세요.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    submitBusyRef.current = true;
    createInquiry.mutate(
      {
        category: 'tournament',
        title: trimmedTitle,
        body: trimmedBody,
        relatedType: 'tournament',
        relatedId: tournamentId,
        ...(isLoggedIn
          ? {}
          : {
              ...(trimmedEmail ? { guestEmail: trimmedEmail } : {}),
              ...(trimmedPhone ? { guestPhone: trimmedPhone } : {}),
            }),
      },
      {
        onSuccess: () => onSubmitted(),
        onError: (error) => setErrors({ form: friendlyErrorMessage(error) }),
        onSettled: () => {
          submitBusyRef.current = false;
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-inquiry-title"
        className="w-full sm:max-w-[420px]"
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} style={{ padding: '24px 20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 id="tournament-inquiry-title" className="tm-text-body-lg" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
              대회 문의하기
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', minWidth: 44, minHeight: 44 }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <TextField
              label="제목"
              value={title}
              maxLength={80}
              error={errors.title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="궁금하신 점을 짧게 요약해 주세요"
            />
            <TextField
              label="내용"
              value={body}
              maxLength={2000}
              error={errors.body}
              multiline
              rows={6}
              onChange={(event) => setBody(event.target.value)}
              placeholder="불편사항, 건의, 질문을 자유롭게 남겨 주세요"
            />

            {!isLoggedIn ? (
              <>
                <TextField
                  label="이메일"
                  optional
                  type="email"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  placeholder="답변받을 이메일"
                />
                <TextField
                  label="전화번호"
                  optional
                  type="tel"
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(event.target.value)}
                  placeholder="010-1234-5678"
                />
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: -6 }}>
                  로그인하지 않으셨어요. 이메일 또는 전화번호 중 하나는 꼭 입력해 주세요.
                </p>
                {errors.guestContact ? (
                  <p role="alert" className="tm-text-caption" style={{ color: 'var(--red500)', marginTop: -6 }}>
                    {errors.guestContact}
                  </p>
                ) : null}
              </>
            ) : null}

            {errors.form ? (
              <p role="alert" className="tm-text-label" style={{ color: 'var(--red500)' }}>
                {errors.form}
              </p>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={onClose} className="tm-btn tm-btn-lg tm-btn-neutral">
                취소
              </button>
              <button type="submit" disabled={createInquiry.isPending} className="tm-btn tm-btn-lg tm-btn-primary">
                {createInquiry.isPending ? '접수 중...' : '문의 접수'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function friendlyErrorMessage(error: unknown) {
  if (error instanceof V1ApiError) {
    if (error.statusCode === 400) return '입력값을 확인해 주세요.';
    return error.message || '문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.';
  }
  return '문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.';
}
