import Link from 'next/link';
import { RefreshIcon } from '@/components/v1-ui/icons';
import { WeatherStrip } from '@/components/v1-ui/primitives';
import type { HomeQuickAction, HomeViewModel } from './home.types';

const trendGuides = [
  '주말 오후 축구와 풋살 모집이 가장 빠르게 마감됩니다.',
  '날씨가 바뀌면 주최자 공지를 먼저 확인하세요.',
  '처음 참여한다면 승인제 매치부터 시작하는 편이 안전합니다.',
] as const;

type HomeRightRailProps = {
  readonly model: HomeViewModel;
  readonly monthlyActivity: string;
  readonly mannerScore: string;
};

export function HomeRightRail({ model, monthlyActivity, mannerScore }: HomeRightRailProps) {
  return (
    <aside className="tm-home-od-right-rail" data-testid="home-od-right-rail" data-desktop-only="true" aria-label="홈 요약">
      <div className="tm-home-od-rail-card">
        <div className="tm-text-label">활동 요약</div>
        <RailStat label="이번 달 활동" value={monthlyActivity} sub={model.network ? '연결 대기' : model.stats.monthlyActivitySub} />
        <RailStat label="매너 점수" value={mannerScore} sub={model.signedOut ? '로그인 후 확인' : model.stats.mannerScoreSub} />
      </div>
      <div className="tm-home-od-rail-card">
        <div className="tm-home-weather-head">
          <div className="tm-text-label">현재 위치 날씨</div>
          <button
            className="tm-btn tm-btn-icon tm-btn-neutral"
            type="button"
            onClick={model.refreshWeather}
            disabled={!model.refreshWeather || model.weatherRefreshing}
            aria-label={model.weatherRefreshing ? '날씨 확인 중' : '현재 위치 날씨 새로고침'}
          >
            <RefreshIcon size={18} strokeWidth={2.1} />
          </button>
        </div>
        <WeatherStrip {...model.weather} />
      </div>
      <div className="tm-home-od-rail-card">
        <div className="tm-text-label">이번 주 참고</div>
        <div className="tm-home-od-trend-list">
          {trendGuides.map((guide) => (
            <div key={guide} className="tm-text-caption">{guide}</div>
          ))}
        </div>
      </div>
      <div className="tm-home-od-rail-card tm-home-od-tip-card">
        <div className="tm-text-label">안전한 참가 팁</div>
        <p>확정 전 경기장, 환불 기준, 주최자 공지를 한 번 더 확인하세요.</p>
      </div>
      <QuickActionRow actions={model.quickActions} />
    </aside>
  );
}

function RailStat({ label, value, sub }: { readonly label: string; readonly value: string; readonly sub: string }) {
  return (
    <div className="tm-home-od-rail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function QuickActionRow({ actions }: { readonly actions: readonly HomeQuickAction[] }) {
  return (
    <div className="tm-quick-grid">
      {actions.map((item) => {
        const content = (
          <>
            <div aria-hidden="true" className="tm-quick-icon" style={{ background: item.background, color: item.color }}>
              {item.label.slice(0, 1)}
            </div>
            <span className="tm-quick-label tm-text-micro">{item.label}</span>
          </>
        );

        if (item.disabled || !item.href) {
          return (
            <button key={item.label} aria-label={`${item.label} 이용 불가`} className="tm-pressable tm-quick-action" disabled type="button">
              {content}
            </button>
          );
        }

        return (
          <Link key={item.label} aria-label={item.label} className="tm-pressable tm-quick-action" href={item.href}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
