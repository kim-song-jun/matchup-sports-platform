import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarDays, Handshake, MapPin, Trophy } from 'lucide-react';
import { FormattedText } from '@/components/v1-ui/formatted-text';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { formatTournamentDateRangeLong } from '@/lib/date-utils';
import { formatPrizeRowValue, parsePrizeRows } from '@/lib/prize-breakdown';
import type {
  V1AdminTournamentCampaignPreview,
  V1PublicTournamentCampaign,
} from '@/types/tournament-campaign';
import { PrizeRankIcon } from './prize-rank-icon';
import { TournamentCampaignMedia } from './tournament-campaign-media';
import { TournamentCampaignPrimaryAction } from './tournament-campaign-primary-action';
import { TournamentRegistrationCountdown } from './tournament-registration-countdown';
import { TournamentSponsorSection } from './tournament-sponsor-section';
import {
  formatPrizeSummary,
  formatSponsorSummary,
  getCampaignActions,
  getCampaignActionHeading,
} from './tournament-campaign-presentation';
import styles from './tournament-campaign-template.module.css';

type TournamentCampaignTemplateProps = {
  readonly campaign: V1PublicTournamentCampaign | V1AdminTournamentCampaignPreview;
  readonly preview?: boolean;
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
  const prizeRows = tournament.prizeBreakdown
    ? parsePrizeRows(tournament.prizeBreakdown).filter(
        (row) => row.amount.trim().length > 0,
      )
    : [];

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
          <div className={styles.heroConversion}>
            <TournamentRegistrationCountdown
              deadlineAt={tournament.registrationDeadlineAt}
              availability={tournament.registrationAvailability}
            />
            <div className={styles.heroActions}>
              <TournamentCampaignPrimaryAction
                action={actions.primary}
                registrationDeadlineAt={tournament.registrationDeadlineAt}
                enforceRegistrationDeadline={tournament.status === 'open'}
              />
              <Link className={styles.heroSecondaryAction} href={actions.secondary.href}>
                {actions.secondary.label}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.content}>
        <section className={styles.facts} aria-label="대회 핵심 정보">
          <CampaignFact icon={<CalendarDays aria-hidden="true" />} label="일정" value={dateLabel} />
          <CampaignFact icon={<MapPin aria-hidden="true" />} label="장소" value={tournament.venue ?? '장소 협의 중'} />
          <CampaignFact icon={<Trophy aria-hidden="true" />} label="총 상금" value={formatPrizeSummary(tournament.prizeSummary, tournament.prizePool)} />
          <CampaignFact icon={<Handshake aria-hidden="true" />} label="후원사" value={formatSponsorSummary(tournament.sponsors.map((sponsor) => sponsor.name))} />
        </section>

        <section className={styles.intro} aria-labelledby="campaign-intro-title">
          <div>
            <span className={styles.sectionKicker}>대회 이야기</span>
            <h2 id="campaign-intro-title" className={styles.sectionTitle}>{content.intro.title}</h2>
          </div>
          <FormattedText className={styles.introBody} text={content.intro.body} />
        </section>

        {content.highlights.length > 0 ? (
          <section className={styles.section} aria-labelledby="campaign-highlights-title">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>참가할 이유</span>
              <h2 id="campaign-highlights-title" className={styles.sectionTitle}>
                {content.highlightsSectionTitle}
              </h2>
            </div>
            <div className={styles.highlightGrid}>
              {content.highlights.map((highlight, index) => {
                const hasImage = Boolean(highlight.imageUrl);
                return (
                  <article
                    key={`${highlight.title}:${highlight.body}:${index}`}
                    className={`${styles.highlightCard} ${hasImage ? '' : styles.highlightCardTextOnly}`}
                  >
                    {hasImage ? (
                      <div className={styles.highlightMedia}>
                        <TournamentCampaignMedia
                          src={highlight.imageUrl}
                          sportCode={tournament.sport.code}
                          alt={highlight.title}
                          className={styles.highlightImage}
                        />
                      </div>
                    ) : (
                      <span className={styles.highlightIndex} aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    )}
                    <div className={styles.highlightContent}>
                      <h3>{highlight.title}</h3>
                      <p>{highlight.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {tournament.prizeSummary || tournament.prizePool !== null ? (
          <section className={styles.prize} aria-labelledby="campaign-prize-title">
            <div className={styles.prizeSummary}>
              <div className={styles.prizeIcon} aria-hidden="true"><Trophy /></div>
              <div>
                <span className={styles.sectionKicker}>상금 안내</span>
                <h2 id="campaign-prize-title" className={styles.prizeTitle}>
                  {tournament.prizeSummary ?? `${tournament.prizePool?.toLocaleString('ko-KR')}원`}
                </h2>
                <p>순위와 개인 시상 결과는 대회 종료 후 결과 페이지에 투명하게 기록합니다.</p>
              </div>
            </div>
            {prizeRows.length > 0 ? (
              <dl className={styles.prizeBreakdown} aria-label="상금 및 상품 구성">
                {prizeRows.map((row, index) => (
                  <div key={`${row.label}:${row.amount}:${index}`}>
                    <dt>
                      <span className={styles.prizeRankIcon} aria-hidden="true">
                        <PrizeRankIcon label={row.label} />
                      </span>
                      {row.label}
                    </dt>
                    <dd>{formatPrizeRowValue(row.amount)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ) : null}

        <TournamentSponsorSection sponsors={tournament.sponsors} showEmptyState />

        {content.faq.length > 0 ? (
          <section className={styles.section} aria-labelledby="campaign-faq-title">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>참가 전 확인</span>
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
          <div className={styles.actionsIntro}>
            <span className={styles.sectionKicker}>다음 단계</span>
            <h2 className={styles.actionsTitle}>
              {getCampaignActionHeading(tournament.status, tournament.registrationAvailability)}
            </h2>
          </div>
          <div className={styles.actionLinks}>
            <Link
              className={`tm-btn tm-btn-neutral tm-btn-lg ${styles.actionSecondary}`}
              href={actions.secondary.href}
            >
              {actions.secondary.label}
            </Link>
            <TournamentCampaignPrimaryAction
              action={actions.primary}
              registrationDeadlineAt={tournament.registrationDeadlineAt}
              enforceRegistrationDeadline={tournament.status === 'open'}
            />
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
