import type { ReactNode } from 'react';
import { CalendarDays, Handshake, MapPin, Trophy } from 'lucide-react';
import { FormattedText } from '@/components/v1-ui/formatted-text';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import { formatTournamentDateRangeLong } from '@/lib/date-utils';
import type {
  V1AdminTournamentCampaignPreview,
  V1PublicTournamentCampaign,
} from '@/types/tournament-campaign';
import { TournamentCampaignMedia } from './tournament-campaign-media';
import { TournamentCampaignDecision } from './tournament-campaign-decision';
import { TournamentCampaignRegistrationProvider } from './tournament-campaign-registration-state';
import { TournamentCampaignRewards } from './tournament-campaign-rewards';
import {
  formatPrizeSummary,
  formatSponsorSummary,
  getCampaignActions,
} from './tournament-campaign-presentation';
import styles from './tournament-campaign-template.module.css';
import storyStyles from './tournament-campaign-story.module.css';

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
  const heroTitleLines = splitCampaignHeroTitle(content.hero.title);
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
          <h1
            id="campaign-title"
            className={styles.heroTitle}
            aria-label={content.hero.title}
          >
            {heroTitleLines.map((line, index) => (
              <span key={`${line}:${index}`} aria-hidden="true" className={styles.heroTitleLine}>
                {line}
              </span>
            ))}
          </h1>
          {content.hero.summary ? (
            <p className={styles.heroSummary}>{content.hero.summary}</p>
          ) : null}
        </div>
      </section>

      <TournamentCampaignRegistrationProvider
        availability={tournament.registrationAvailability}
        deadlineAt={tournament.registrationDeadlineAt}
      >
      <div className={styles.content}>
        <section className={styles.facts} aria-label="대회 핵심 정보">
          <CampaignFact icon={<CalendarDays aria-hidden="true" />} label="일정" value={dateLabel} />
          <CampaignFact icon={<MapPin aria-hidden="true" />} label="장소" value={tournament.venue ?? '장소 협의 중'} />
          <CampaignFact icon={<Trophy aria-hidden="true" />} label="총 상금" value={formatPrizeSummary(tournament.prizeSummary, tournament.prizePool)} />
          <CampaignFact icon={<Handshake aria-hidden="true" />} label="후원사" value={formatSponsorSummary(tournament.sponsors.map((sponsor) => sponsor.name))} />
        </section>

        <TournamentCampaignDecision
          actions={actions}
          status={tournament.status}
          statusBadgeClass={status.badgeClass}
          statusLabel={status.label}
        />

        <section className={storyStyles.intro} aria-labelledby="campaign-intro-title">
          <div>
            <span className={storyStyles.sectionKicker}>대회 이야기</span>
            <h2 id="campaign-intro-title" className={storyStyles.sectionTitle}>{content.intro.title}</h2>
          </div>
          <FormattedText className={storyStyles.introBody} text={content.intro.body} />
        </section>

        {content.highlights.length > 0 ? (
          <section className={storyStyles.section} aria-labelledby="campaign-highlights-title">
            <div className={storyStyles.sectionHeading}>
              <span className={storyStyles.sectionKicker}>참가할 이유</span>
              <h2 id="campaign-highlights-title" className={storyStyles.sectionTitle}>
                {content.highlightsSectionTitle}
              </h2>
            </div>
            <div className={storyStyles.highlightGrid}>
              {content.highlights.map((highlight, index) => {
                const hasImage = Boolean(highlight.imageUrl);
                return (
                  <article
                    key={`${highlight.title}:${highlight.body}:${index}`}
                    className={`${storyStyles.highlightCard} ${hasImage ? '' : storyStyles.highlightCardTextOnly}`}
                  >
                    {hasImage ? (
                      <div className={storyStyles.highlightMedia}>
                        <TournamentCampaignMedia
                          src={highlight.imageUrl}
                          sportCode={tournament.sport.code}
                          alt={highlight.title}
                          className={storyStyles.highlightImage}
                        />
                      </div>
                    ) : (
                      <span className={storyStyles.highlightIndex} aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    )}
                    <div className={storyStyles.highlightContent}>
                      <h3>{highlight.title}</h3>
                      <p>{highlight.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <TournamentCampaignRewards tournament={tournament} actions={actions} />

        {content.faq.length > 0 ? (
          <section className={storyStyles.section} aria-labelledby="campaign-faq-title">
            <div className={storyStyles.sectionHeading}>
              <span className={storyStyles.sectionKicker}>참가 전 확인</span>
              <h2 id="campaign-faq-title" className={storyStyles.sectionTitle}>{content.faqSectionTitle}</h2>
            </div>
            <div className={storyStyles.faqList}>
              {content.faq.map((item, index) => (
                <details key={`${item.question}:${item.answer}:${index}`} className={storyStyles.faqItem}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

      </div>
      </TournamentCampaignRegistrationProvider>
    </article>
  );
}

function splitCampaignHeroTitle(title: string): readonly string[] {
  const commaIndex = title.indexOf(',');
  if (commaIndex < 0) return [title];

  const lead = title.slice(0, commaIndex + 1).trim();
  const followUp = title.slice(commaIndex + 1).trim();
  return followUp ? [lead, followUp] : [lead];
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
