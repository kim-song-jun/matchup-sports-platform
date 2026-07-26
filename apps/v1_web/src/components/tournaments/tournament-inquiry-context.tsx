import { Trophy, UserRound } from 'lucide-react';
import type { V1AuthMe } from '@/types/api';
import styles from './tournament-inquiry-modal.module.css';

type TournamentInquiryContextProps = {
  readonly tournamentTitle: string;
  readonly authUser: V1AuthMe | null;
  readonly isSessionChecking: boolean;
  readonly hasSessionError: boolean;
  readonly onRetrySession: () => void;
};

export function TournamentInquiryContext({
  tournamentTitle,
  authUser,
  isSessionChecking,
  hasSessionError,
  onRetrySession,
}: TournamentInquiryContextProps) {
  const isLoggedIn = authUser !== null;
  const requesterName = authUser?.profile.displayName || authUser?.profile.nickname || '로그인 계정';
  const requesterEmail = authUser?.user.email;

  return (
    <>
      <section className={styles.contextCard} aria-label="자동 연결된 문의 정보">
        <div className={styles.contextRow}>
          <Trophy size={17} aria-hidden="true" />
          <span className={styles.contextLabel}>문의 대상</span>
          <strong className={styles.contextValue}>{tournamentTitle}</strong>
        </div>
        <div className={styles.contextRow}>
          <UserRound size={17} aria-hidden="true" />
          <span className={styles.contextLabel}>문의자</span>
          <strong className={styles.contextValue}>
            {isSessionChecking
              ? '계정 확인 중'
              : hasSessionError
                ? '계정 확인 필요'
                : isLoggedIn
                  ? requesterName
                  : '비회원 문의'}
          </strong>
        </div>
        <p className={styles.contextHint}>
          {isSessionChecking
            ? '문의자 정보를 확인하고 있어요.'
            : hasSessionError
              ? '계정 상태를 확인한 뒤 문의를 접수할 수 있어요.'
              : isLoggedIn
                ? requesterEmail
                  ? `${requesterEmail} 계정으로 답변이 연결돼요.`
                  : '현재 로그인한 계정으로 답변이 연결돼요.'
                : '아래에 입력한 연락처로 답변드려요.'}
        </p>
      </section>

      {hasSessionError ? (
        <div role="alert" className={styles.sessionError}>
          <div>
            <strong>계정 정보를 확인하지 못했어요.</strong>
            <p>네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
          </div>
          <button type="button" className="tm-btn tm-btn-md tm-btn-outline" onClick={onRetrySession}>
            다시 확인
          </button>
        </div>
      ) : null}
    </>
  );
}
