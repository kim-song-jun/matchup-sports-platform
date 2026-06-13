import { AppChrome } from '@/components/v1-ui/shell';
import { Card, SectionTitle } from '@/components/v1-ui/primitives';
import { TrophyIcon } from '@/components/v1-ui/icons';

export const metadata = {
  title: '대회 | Teameet',
  description: '상금 걸린 풋살 대회가 곧 열려요.',
};

export default function TournamentsPage() {
  return (
    <AppChrome title="대회" activeTab="tournaments" showNotifications>
      <TournamentsContent />
    </AppChrome>
  );
}

function TournamentsContent() {
  return (
    <div style={{ padding: '0 20px 48px' }}>
      {/* ── Hero teaser card ── */}
      <section aria-labelledby="tournament-teaser-heading" style={{ marginTop: 24 }}>
        <Card pad={0}>
          {/* Gradient banner */}
          <div
            style={{
              borderRadius: '14px 14px 0 0',
              background: 'linear-gradient(135deg, var(--blue500) 0%, color-mix(in srgb, var(--blue500) 70%, #6366f1) 100%)',
              height: 140,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 10,
            }}
            aria-hidden="true"
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: 20,
                background: 'rgba(255,255,255,0.18)',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
              }}
            >
              <TrophyIcon size={36} strokeWidth={1.6} />
            </div>
            <span
              style={{
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.75)',
                textTransform: 'uppercase',
              }}
            >
              상금 대회
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 20px 24px' }}>
            <div className="tm-badge tm-badge-blue" style={{ marginBottom: 10 }}>오픈 예정</div>
            <h1
              id="tournament-teaser-heading"
              className="tm-text-heading"
              style={{ color: 'var(--text-strong)', marginBottom: 8 }}
            >
              상금 걸린 풋살 대회가
              <br />
              곧 열려요
            </h1>
            <p
              className="tm-text-body"
              style={{ color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 20 }}
            >
              팀 단위로 참가해 조별 리그를 거친 뒤 토너먼트에서 우승을 겨루세요.
              상위 팀에게는 실제 상금이 지급돼요.
            </p>

            {/* Format chips */}
            <ul
              role="list"
              aria-label="대회 형식"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                margin: 0,
                padding: 0,
                listStyle: 'none',
              }}
            >
              {FORMAT_CHIPS.map(({ icon, label }) => (
                <li key={label}>
                  <span
                    className="tm-chip"
                    style={{ minHeight: 32, padding: '0 12px', gap: 5, fontSize: 13, fontWeight: 600 }}
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span>{label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </section>

      {/* ── Upcoming placeholder ── */}
      <section aria-labelledby="upcoming-section-heading" style={{ marginTop: 28 }}>
        <SectionTitle title="예정 대회" />
        <div id="upcoming-section-heading" className="sr-only">예정 대회 목록</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <SkeletonMatchRow opacity={0.72} />
          <SkeletonMatchRow opacity={0.4} />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section aria-labelledby="faq-section-heading" style={{ marginTop: 28 }}>
        <div id="faq-section-heading">
          <SectionTitle title="자주 묻는 질문" />
        </div>
        <Card pad={0}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQ_ITEMS.map(({ q, a }, i) => (
              <FaqRow key={q} q={q} a={a} showDivider={i < FAQ_ITEMS.length - 1} />
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ── Data ── */

const FORMAT_CHIPS = [
  { icon: '⚽', label: '풋살 6:6' },
  { icon: '🏟️', label: '8팀 참가' },
  { icon: '📋', label: '조별 리그' },
  { icon: '🏆', label: '결승 토너먼트' },
  { icon: '👥', label: '팀 단위 신청' },
] as const;

const FAQ_ITEMS = [
  {
    q: '대회 신청은 언제부터 가능해요?',
    a: '베타 오픈 일정이 확정되면 앱 알림으로 안내드릴게요.',
  },
  {
    q: '팀이 없으면 참가할 수 없나요?',
    a: '대회는 팀 단위로만 참가할 수 있어요. 팀 탭에서 먼저 팀을 만들어 보세요.',
  },
  {
    q: '상금은 어떻게 정산되나요?',
    a: '우승·준우승 팀 주장 계좌로 직접 정산돼요. 세부 금액은 대회별로 달라요.',
  },
] as const;

/* ── Sub-components ── */

function SkeletonMatchRow({ opacity }: { opacity: number }) {
  return (
    <div
      className="tm-card"
      aria-hidden="true"
      style={{
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        pointerEvents: 'none',
      }}
    >
      {/* Icon placeholder */}
      <div
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'var(--grey100)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-caption)',
        }}
      >
        <TrophyIcon size={20} strokeWidth={1.7} />
      </div>

      {/* Text placeholder bars */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            height: 13,
            borderRadius: 6,
            background: 'var(--grey100)',
            width: '68%',
          }}
        />
        <div
          style={{
            height: 11,
            borderRadius: 6,
            background: 'var(--grey100)',
            width: '44%',
            marginTop: 8,
          }}
        />
      </div>

      {/* Badge placeholder */}
      <div className="tm-badge tm-badge-grey">
        <span className="tm-text-micro">준비 중</span>
      </div>
    </div>
  );
}

function FaqRow({ q, a, showDivider }: { q: string; a: string; showDivider: boolean }) {
  return (
    <div
      style={{
        padding: '16px 18px',
        borderBottom: showDivider ? '1px solid var(--grey100)' : 'none',
      }}
    >
      <div
        className="tm-text-body"
        style={{ color: 'var(--text-strong)', fontWeight: 600, marginBottom: 5 }}
      >
        {q}
      </div>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)', lineHeight: 1.65 }}>
        {a}
      </div>
    </div>
  );
}
