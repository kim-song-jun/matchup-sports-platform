import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  Trophy,
  Users,
  WalletCards,
} from 'lucide-react';
import { FormattedText } from '@/components/v1-ui/formatted-text';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import {
  formatEntryFee,
  formatTournamentDateRangeLong,
} from '@/lib/date-utils';
import type { V1PublicTournamentStatus } from '@/types/api';
import type {
  V1AdminTournamentCampaignPreview,
  V1PublicTournamentCampaign,
  V1TournamentRegistrationAvailability,
} from '@/types/tournament-campaign';
import { TournamentCampaignMedia } from './tournament-campaign-media';
import { TournamentSponsorSection } from './tournament-sponsor-section';
import styles from './tournament-campaign-template.module.css';

type TournamentCampaignTemplateProps = {
  readonly campaign: V1PublicTournamentCampaign | V1AdminTournamentCampaignPreview;
  readonly preview?: boolean;
};

type CampaignAction = {
  readonly label: string;
  readonly href: string;
};

type CampaignActions = {
  readonly primary: CampaignAction | null;
  readonly secondary: CampaignAction;
};

export function TournamentCampaignTemplate({
  campaign,
  preview = false,
}: TournamentCampaignTemplateProps) {
  const { content, tournament } = campaign;
  const actions = getCampaignActions(
    tournament.status,
    tournament.registrationAvailability,
    tournament.id,
  );
  const status = getTournamentStatusConfig(tournament.status);
  const heroImage = content.hero.imageUrl ?? tournament.coverImageUrl;
  const dateLabel = formatTournamentDateRangeLong(
    tournament.scheduledAt,
    tournament.scheduledEndAt,
  );

  return (
    <article className={styles.campaign} data-preview={preview || undefined}>
      <section className={styles.hero} aria-labelledby="campaign-title">
        <TournamentCampaignMedia
          src={heroImage}
          sportCode={tournament.sport.code}
          alt={content.hero.title}
          className={styles.heroImage}
          eager={!preview}
        />
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>
            <span className={`tm-badge ${status.badgeClass}`}>{status.label}</span>
            <span>{tournament.sport.name}</span>
          </div>
          <h1 id="campaign-title" className={styles.heroTitle}>{content.hero.title}</h1>
          {content.hero.summary ? (
            <p className={styles.heroSummary}>{content.hero.summary}</p>
          ) : null}
        </div>
      </section>

      <div className={styles.content}>
        <section className={styles.facts} aria-label="대회 핵심 정보">
          <CampaignFact icon={<CalendarDays aria-hidden="true" />} label="일정" value={dateLabel} />
          <CampaignFact icon={<MapPin aria-hidden="true" />} label="장소" value={tournament.venue ?? '장소 협의 중'} />
          <CampaignFact
            icon={<Users aria-hidden="true" />}
            label="참가 현황"
            value={formatParticipantCount(
              tournament.confirmedCount,
              tournament.pendingPaymentCount,
              tournament.teamCount,
            )}
          />
          <CampaignFact icon={<WalletCards aria-hidden="true" />} label="참가비" value={formatEntryFee(tournament.entryFee)} />
        </section>

        <section className={styles.intro} aria-labelledby="campaign-intro-title">
          <div>
            <span className={styles.sectionKicker}>Tournament story</span>
            <h2 id="campaign-intro-title" className={styles.sectionTitle}>{content.intro.title}</h2>
          </div>
          <FormattedText className={styles.introBody} text={content.intro.body} />
        </section>

        {content.highlights.length > 0 ? (
          <section className={styles.section} aria-labelledby="campaign-highlights-title">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>Highlights</span>
              <h2 id="campaign-highlights-title" className={styles.sectionTitle}>
                {content.highlightsSectionTitle}
              </h2>
            </div>
            <div className={styles.highlightGrid}>
              {content.highlights.map((highlight, index) => (
                <article key={`${highlight.title}:${highlight.body}:${index}`} className={styles.highlightCard}>
                  <div className={styles.highlightMedia}>
                    <TournamentCampaignMedia
                      src={highlight.imageUrl}
                      sportCode={tournament.sport.code}
                      alt={highlight.title}
                      className={styles.highlightImage}
                    />
                  </div>
                  <div className={styles.highlightContent}>
                    <h3>{highlight.title}</h3>
                    <p>{highlight.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {tournament.prizeSummary || tournament.prizePool !== null ? (
          <section className={styles.prize} aria-labelledby="campaign-prize-title">
            <div className={styles.prizeIcon} aria-hidden="true"><Trophy /></div>
            <div>
              <span className={styles.sectionKicker}>Prize</span>
              <h2 id="campaign-prize-title" className={styles.prizeTitle}>
                {tournament.prizeSummary ?? `${tournament.prizePool?.toLocaleString('ko-KR')}원`}
              </h2>
              <p>참가 팀의 도전을 마지막 시상까지 투명하게 이어갑니다.</p>
            </div>
          </section>
        ) : null}

        <TournamentSponsorSection sponsors={tournament.sponsors} />

        {content.faq.length > 0 ? (
          <section className={styles.section} aria-labelledby="campaign-faq-title">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>FAQ</span>
              <h2 id="campaign-faq-title" className={styles.sectionTitle}>{content.faqSectionTitle}</h2>
            </div>
            <div className={styles.faqList}>
              {content.faq.map((item, index) => (
                <details key={`${item.question}:${item.answer}:${index}`} className={styles.faqItem}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.actions} aria-label="대회 다음 단계">
          <div>
            <span className={styles.sectionKicker}>Next step</span>
            <h2 className={styles.actionsTitle}>
              {getActionHeading(tournament.status, tournament.registrationAvailability)}
            </h2>
          </div>
          <div className={styles.actionLinks}>
            <Link className="tm-btn tm-btn-neutral tm-btn-lg" href={actions.secondary.href}>
              {actions.secondary.label}
            </Link>
            {actions.primary ? (
              <Link className="tm-btn tm-btn-primary tm-btn-lg" href={actions.primary.href}>
                {actions.primary.label}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </article>
  );
}

function CampaignFact({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={styles.fact}>
      <span className={styles.factIcon}>{icon}</span>
      <div>
        <span className={styles.factLabel}>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function getCampaignActions(
  status: V1PublicTournamentStatus,
  registrationAvailability: V1TournamentRegistrationAvailability,
  tournamentId: string,
): CampaignActions {
  const secondary = { label: '대회 상세 보기', href: `/tournaments/${tournamentId}` };

  switch (status) {
    case 'open':
      return registrationAvailability === 'available'
        ? { primary: { label: '참가 신청하기', href: `/tournaments/${tournamentId}/my` }, secondary }
        : { primary: null, secondary };
    case 'closed':
      return { primary: null, secondary };
    case 'in_progress':
      return { primary: { label: '대진표 보기', href: `/tournaments/${tournamentId}/bracket` }, secondary };
    case 'completed':
      return { primary: { label: '결과 보기', href: `/tournaments/${tournamentId}/results` }, secondary };
  }
}

function getActionHeading(
  status: V1PublicTournamentStatus,
  registrationAvailability: V1TournamentRegistrationAvailability,
): string {
  switch (status) {
    case 'open': {
      switch (registrationAvailability) {
        case 'available':
          return '함께 뛸 팀을 기다리고 있어요';
        case 'deadline_passed':
          return '접수 기간이 종료됐어요';
        case 'full':
          return '참가 정원이 모두 찼어요';
        case 'started':
          return '이미 시작된 대회예요';
        case 'closed':
          return '현재 참가 신청을 받지 않아요';
      }
    }
    case 'closed':
      return '접수가 마감된 대회예요';
    case 'in_progress':
      return '지금 펼쳐지는 경기를 확인하세요';
    case 'completed':
      return '대회의 마지막 기록을 확인하세요';
  }
}

function formatParticipantCount(
  confirmedCount: number,
  pendingPaymentCount: number,
  teamCount: number,
): string {
  if (pendingPaymentCount === 0) return `${confirmedCount}/${teamCount}팀`;
  return `${confirmedCount}팀 확정 · ${pendingPaymentCount}팀 입금 대기 / ${teamCount}팀`;
}
