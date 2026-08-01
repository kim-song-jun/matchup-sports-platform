'use client';

import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { formatPrizeRowValue, parsePrizeRows } from '@/lib/prize-breakdown';
import type {
  V1AdminTournamentCampaignPreview,
  V1PublicTournamentCampaign,
} from '@/types/tournament-campaign';
import { PrizeRankIcon } from './prize-rank-icon';
import { TournamentCampaignPrimaryAction } from './tournament-campaign-primary-action';
import type { getCampaignActions } from './tournament-campaign-presentation';
import { useTournamentCampaignRegistration } from './tournament-campaign-registration-state';
import { TournamentRegistrationCountdown } from './tournament-registration-countdown';
import { TournamentSponsorSection } from './tournament-sponsor-section';
import styles from './tournament-campaign-rewards.module.css';

type CampaignTournament =
  | V1PublicTournamentCampaign['tournament']
  | V1AdminTournamentCampaignPreview['tournament'];

type TournamentCampaignRewardsProps = {
  readonly tournament: CampaignTournament;
  readonly actions: ReturnType<typeof getCampaignActions>;
};

export function TournamentCampaignRewards({
  tournament,
  actions,
}: TournamentCampaignRewardsProps) {
  const { registrationOpen } = useTournamentCampaignRegistration();
  const prizeRows = tournament.prizeBreakdown
    ? parsePrizeRows(tournament.prizeBreakdown).filter(
        (row) => row.amount.trim().length > 0,
      )
    : [];
  const followUpHeading = getFollowUpHeading(tournament.status, registrationOpen);

  return (
    <section className={styles.rewards} aria-labelledby="campaign-rewards-title">
      <div className={styles.rewardsHeading}>
        <span className={styles.sectionKicker}>보상과 파트너</span>
        <h2 id="campaign-rewards-title" className={styles.sectionTitle}>
          우승의 보상, 함께 만드는 파트너
        </h2>
        <p>대회의 보상과 공식 파트너 혜택을 한 흐름에서 확인하고 신청까지 이어가세요.</p>
      </div>

      {tournament.prizeSummary || tournament.prizePool !== null ? (
        <div className={styles.prize} role="group" aria-labelledby="campaign-prize-title">
          <div className={styles.prizeSummary}>
            <div className={styles.prizeIcon} aria-hidden="true"><Trophy /></div>
            <div>
              <span className={styles.sectionKicker}>총 보상</span>
              <h3 id="campaign-prize-title" className={styles.prizeTitle}>
                {tournament.prizeSummary ?? `${tournament.prizePool?.toLocaleString('ko-KR')}원`}
              </h3>
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
        </div>
      ) : null}

      <TournamentSponsorSection
        sponsors={tournament.sponsors}
        showEmptyState
        variant="embedded"
      />

      <div className={styles.rewardsAction}>
        <div>
          <span className={styles.sectionKicker}>다음 단계</span>
          <h3 className={styles.rewardsActionTitle}>{followUpHeading}</h3>
        </div>
        <div className={styles.rewardsActionConversion}>
          <TournamentRegistrationCountdown tone="surface" />
          <div className={styles.actionLinks}>
            <TournamentCampaignPrimaryAction
              action={actions.primary}
              enforceRegistrationDeadline={tournament.status === 'open'}
            />
            <Link
              className="tm-btn tm-btn-neutral tm-btn-lg"
              href={actions.secondary.href}
            >
              {actions.secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function getFollowUpHeading(
  status: CampaignTournament['status'],
  registrationOpen: boolean,
): string {
  switch (status) {
    case 'open':
      return registrationOpen ? '참가 준비를 마무리하세요' : '대회 상세 안내를 확인해 주세요';
    case 'in_progress':
      return '현재 경기 흐름을 확인하세요';
    case 'completed':
      return '결과와 기록을 다시 만나보세요';
    case 'closed':
      return '대회 상세 안내를 확인해 주세요';
  }
}
