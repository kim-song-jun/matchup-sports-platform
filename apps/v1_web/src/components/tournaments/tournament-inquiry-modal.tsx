'use client';

import { useRef, useState, type FormEvent } from 'react';
import { CircleHelp, Tag, X } from 'lucide-react';
import { TextField } from '@/components/v1-ui/primitives';
import { useV1CreateInquiry } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import type { V1AuthMe } from '@/types/api';
import styles from './tournament-inquiry-modal.module.css';
import {
  findTournamentInquiryTopic,
  TOURNAMENT_INQUIRY_TOPICS,
  type TournamentInquiryTopic,
} from './tournament-inquiry-topics';
import { useTournamentInquiryDialog } from './use-tournament-inquiry-dialog';
import { TournamentInquiryContext } from './tournament-inquiry-context';

type InquiryFormErrors = Partial<Record<'title' | 'body' | 'guestContact' | 'form', string>>;
type TournamentInquiryModalProps = {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly authUser: V1AuthMe | null;
  readonly isSessionChecking: boolean;
  readonly hasSessionError: boolean;
  readonly onRetrySession: () => void;
  readonly onClose: () => void;
  readonly onSubmitted: () => void;
};

export function TournamentInquiryModal({
  tournamentId,
  tournamentTitle,
  authUser,
  isSessionChecking,
  hasSessionError,
  onRetrySession,
  onClose,
  onSubmitted,
}: TournamentInquiryModalProps) {
  const createInquiry = useV1CreateInquiry();
  const isLoggedIn = authUser !== null;
  const isSessionBlocked = isSessionChecking || hasSessionError;
  const [topic, setTopic] = useState<TournamentInquiryTopic>('participation');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [errors, setErrors] = useState<InquiryFormErrors>({});
  const dialogRef = useTournamentInquiryDialog(onClose);
  const submitBusyRef = useRef(false);
  const selectedTopic = findTournamentInquiryTopic(topic) ?? TOURNAMENT_INQUIRY_TOPICS[0];
  const maximumTitleLength = 80 - selectedTopic.titlePrefix.length - 1;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBusyRef.current || isSessionBlocked) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const trimmedEmail = guestEmail.trim();
    const trimmedPhone = guestPhone.trim();
    const nextErrors: InquiryFormErrors = {};

    if (!trimmedTitle) nextErrors.title = '문의 제목을 입력해 주세요.';
    if (trimmedTitle.length > maximumTitleLength) {
      nextErrors.title = `문의 제목은 ${maximumTitleLength}자 이내로 입력해 주세요.`;
    }
    if (!trimmedBody) nextErrors.body = '문의 내용을 입력해 주세요.';
    if (!isLoggedIn && !trimmedEmail && !trimmedPhone) {
      nextErrors.guestContact = '답변받을 이메일 또는 전화번호 중 하나를 입력해 주세요.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    submitBusyRef.current = true;
    createInquiry.mutate(
      {
        category: selectedTopic.apiCategory,
        title: `${selectedTopic.titlePrefix} ${trimmedTitle}`,
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
        onSuccess: onSubmitted,
        onError: (error) => setErrors({ form: friendlyErrorMessage(error) }),
        onSettled: () => {
          submitBusyRef.current = false;
        },
      },
    );
  };

  const guestContactDescription = errors.guestContact
    ? 'tournament-guest-contact-help tournament-guest-contact-error'
    : 'tournament-guest-contact-help';

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-inquiry-title"
        aria-describedby="tournament-inquiry-description"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <form className={styles.form} onSubmit={submit}>
          <header className={styles.header}>
            <div className={styles.headingGroup}>
              <span className={styles.headingIcon} aria-hidden="true">
                <CircleHelp size={22} strokeWidth={2.1} />
              </span>
              <div>
                <h2 id="tournament-inquiry-title" className={styles.title}>대회 문의하기</h2>
                <p id="tournament-inquiry-description" className={styles.description}>
                  문의 대상과 답변 계정을 확인한 뒤 내용을 남겨 주세요.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="문의창 닫기" className={styles.closeButton}>
              <X size={21} aria-hidden="true" />
            </button>
          </header>

          <div className={styles.body}>
            <TournamentInquiryContext
              tournamentTitle={tournamentTitle}
              authUser={authUser}
              isSessionChecking={isSessionChecking}
              hasSessionError={hasSessionError}
              onRetrySession={onRetrySession}
            />

            <div className={styles.fieldGroup}>
              <label htmlFor="tournament-inquiry-topic" className="tm-text-label">
                문의 유형
              </label>
              <div className={styles.selectWrap}>
                <Tag size={18} aria-hidden="true" />
                <select
                  id="tournament-inquiry-topic"
                  className={`tm-input ${styles.select}`}
                  value={topic}
                  onChange={(event) => {
                    const nextTopic = findTournamentInquiryTopic(event.target.value);
                    if (nextTopic) setTopic(nextTopic.value);
                  }}
                >
                  {TOURNAMENT_INQUIRY_TOPICS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <p className={styles.fieldHint}>{selectedTopic.description}</p>
            </div>

            <TextField
              label="제목"
              value={title}
              maxLength={maximumTitleLength}
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
              rows={5}
              onChange={(event) => setBody(event.target.value)}
              placeholder="상황을 자세히 적어 주시면 더 정확히 답변할 수 있어요"
            />

            {!isLoggedIn && !isSessionBlocked ? (
              <fieldset className={styles.guestFields}>
                <legend className={styles.guestHeading}>
                  <strong>답변받을 연락처</strong>
                  <span>둘 중 하나만 입력해도 돼요.</span>
                </legend>
                <TextField
                  label="이메일"
                  type="email"
                  value={guestEmail}
                  aria-invalid={Boolean(errors.guestContact)}
                  aria-describedby={guestContactDescription}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  placeholder="name@example.com"
                />
                <TextField
                  label="전화번호"
                  type="tel"
                  value={guestPhone}
                  aria-invalid={Boolean(errors.guestContact)}
                  aria-describedby={guestContactDescription}
                  onChange={(event) => setGuestPhone(event.target.value)}
                  placeholder="010-1234-5678"
                />
                <p id="tournament-guest-contact-help" className={styles.fieldHint}>답변을 받을 연락처 한 가지만 입력해 주세요.</p>
                {errors.guestContact ? <p id="tournament-guest-contact-error" role="alert" className={styles.error}>{errors.guestContact}</p> : null}
              </fieldset>
            ) : null}

            {errors.form ? <p role="alert" className={styles.errorBanner}>{errors.form}</p> : null}
          </div>

          <footer className={styles.footer}>
            <button type="button" onClick={onClose} className="tm-btn tm-btn-lg tm-btn-neutral">
              취소
            </button>
            <button type="submit" disabled={isSessionBlocked || createInquiry.isPending} className="tm-btn tm-btn-lg tm-btn-primary">
              {isSessionChecking
                ? '계정 확인 중...'
                : hasSessionError
                  ? '계정 확인 필요'
                  : createInquiry.isPending
                    ? '접수 중...'
                    : '문의 접수'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function friendlyErrorMessage(error: unknown) {
  if (error instanceof V1ApiError) {
    if (error.statusCode === 400) return '입력 내용을 다시 확인해 주세요.';
    return error.message || '문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.';
  }
  return '문의 접수에 실패했어요. 잠시 후 다시 시도해 주세요.';
}
