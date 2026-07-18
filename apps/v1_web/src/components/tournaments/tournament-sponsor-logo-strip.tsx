import type { V1TournamentSponsor } from '@/types/api';

/**
 * 참가 신청 페이지 최하단용 후원사 로고 축약 노출.
 * TournamentSponsorSection(대회 상세용, 설명·혜택·부스·외부링크 포함)과 달리
 * 순수 로고 이미지만 나열한다 — 클릭 핸들러/<a> 태그를 두지 않는다(외부 이동 없음).
 */
export function SponsorLogoStrip({
  sponsors,
}: {
  sponsors: V1TournamentSponsor[];
}) {
  const logoSponsors = sponsors
    .filter((sponsor) => sponsor.logoUrl)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (logoSponsors.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="후원사"
      style={{
        marginTop: 32,
        paddingTop: 20,
        borderTop: '1px solid var(--border)',
      }}
    >
      <div
        className="tm-text-caption"
        style={{ color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}
      >
        함께하는 후원사
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        {logoSponsors.map((sponsor) => (
          <img
            key={sponsor.id}
            src={sponsor.logoUrl ?? ''}
            alt={sponsor.name}
            width={72}
            height={40}
            loading="lazy"
            style={{
              height: 40,
              width: 'auto',
              maxWidth: 120,
              objectFit: 'contain',
            }}
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ))}
      </div>
    </section>
  );
}
