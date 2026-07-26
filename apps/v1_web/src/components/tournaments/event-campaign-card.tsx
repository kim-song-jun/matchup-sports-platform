import Link from 'next/link';
import { ArrowRight, CalendarDays, Clock3, MapPin, Trophy } from 'lucide-react';
import { formatTournamentDateRangeShort } from '@/lib/date-utils';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { getTournamentStatusConfig } from '@/lib/v1-tournament-status';
import type { V1TournamentCampaignListItem } from '@/types/tournament-campaign';
import { TournamentCampaignMedia } from './tournament-campaign-media';
import styles from '@/app/events/events-page.module.css';

export function EventCampaignCard({
  item,
  activeSportCode,
}: {
  readonly item: V1TournamentCampaignListItem;
  readonly activeSportCode?: string;
}) {
  const sportAccent = getSportAccent(item.tournament.sport.code);
  const status = getTournamentStatusConfig(item.tournament.status);
  const dateLabel = formatTournamentDateRangeShort(
    item.tournament.scheduledAt,
    item.tournament.scheduledEndAt,
  );
  const deadlineLabel = formatRegistrationDeadline(
    item.tournament.registrationDeadlineAt,
    item.tournament.registrationAvailability,
  );
  const prizeLabel = item.tournament.prizeSummary
    ?? (item.tournament.prizePool !== null
      ? `총 ${item.tournament.prizePool.toLocaleString('ko-KR')}원`
      : null);
  const ariaLabel = [
    item.heroTitle,
    item.tournament.sport.name,
    status.label,
    dateLabel,
    item.tournament.venue,
    prizeLabel,
    deadlineLabel,
  ].filter(Boolean).join(' — ');

  return (
    <Link
      href={`/tournaments/campaigns/${item.slug}?from=events${activeSportCode ? `&sport=${encodeURIComponent(activeSportCode)}` : ''}`}
      className={`tm-card tm-pressable ${styles.card}`}
      aria-label={ariaLabel}
    >
      <div className={styles.media} aria-hidden="true">
        {item.heroImageUrl ? (
          <TournamentCampaignMedia
            src={item.heroImageUrl}
            sportCode={item.tournament.sport.code}
            alt=""
            className={styles.image}
          />
        ) : (
          <div
            className={styles.fallback}
            style={{ background: `linear-gradient(135deg, ${sportAccent.dot}, ${sportAccent.gradientTo ?? sportAccent.dot})` }}
          >
            <Trophy size={40} aria-hidden="true" />
          </div>
        )}
        <span className={`tm-badge ${status.badgeClass} ${styles.status}`}>{status.label}</span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.heading}>
          <span
            className={styles.sportBadge}
            style={{ background: sportAccent.badgeBg, color: sportAccent.badgeText }}
            aria-label={`종목: ${item.tournament.sport.name}`}
          >
            <span aria-hidden="true" style={{ background: sportAccent.dot }} />
            {item.tournament.sport.name}
          </span>
          <h2 className="tm-text-body-lg">{item.heroTitle}</h2>
          {item.heroSummary ? <p className={styles.summary}>{item.heroSummary}</p> : null}
        </div>

        <div className={styles.metadata}>
          {dateLabel ? <span><CalendarDays aria-hidden="true" /><span>{dateLabel}</span></span> : null}
          {item.tournament.venue ? <span><MapPin aria-hidden="true" /><span>{item.tournament.venue}</span></span> : null}
        </div>

        <div className={styles.cardFooter}>
          <div className={styles.promotion}>
            {prizeLabel ? <span className={styles.prize}><Trophy aria-hidden="true" />{prizeLabel}</span> : null}
            {deadlineLabel ? <span className={styles.deadline}><Clock3 aria-hidden="true" />{deadlineLabel}</span> : null}
          </div>
          <span className={styles.detailCta}>자세히 보기 <ArrowRight aria-hidden="true" /></span>
        </div>
      </div>
    </Link>
  );
}

function formatRegistrationDeadline(
  deadlineAt: string | null,
  availability: V1TournamentCampaignListItem['tournament']['registrationAvailability'],
): string | null {
  if (availability !== 'available' || !deadlineAt) return null;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return null;
  const days = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return '오늘 신청 마감';
  if (days <= 14) return `신청 마감 D-${days}`;
  return `${deadline.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 신청 마감`;
}
