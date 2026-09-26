import type { ReactNode } from 'react';
import { HomeIcon, MatchIcon, MyIcon, TeamsIcon, TrophyIcon } from '@/components/v1-ui/icons';

export type LandingTabKey = 'home' | 'match' | 'cup' | 'team' | 'my';

const TABS: ReadonlyArray<{ key: LandingTabKey; label: string; Icon: typeof HomeIcon }> = [
  { key: 'home', label: '홈', Icon: HomeIcon },
  { key: 'match', label: '매치', Icon: MatchIcon },
  { key: 'cup', label: '대회', Icon: TrophyIcon },
  { key: 'team', label: '팀', Icon: TeamsIcon },
  { key: 'my', label: '마이', Icon: MyIcon },
];

/**
 * 폰 목업. 안쪽은 실제 앱 폭(375px)·실제 타입 스케일로 그린 뒤 통째로 축소한다 —
 * 글자만 따로 줄이면 v1 화면 비율이 깨진다. 축소된 글자는 읽기용 텍스트가 아니므로
 * role="img" 로 묶고 같은 내용을 옆 설명 텍스트가 전달한다(docs/design/a11y-decisions.md).
 */
export function LandingDevice({
  label,
  size,
  activeTab,
  children,
}: {
  label: string;
  size: 'hero' | 'stage' | 'mini';
  activeTab: LandingTabKey | null;
  children: ReactNode;
}) {
  return (
    <div className="tm-landing-device" data-size={size} role="img" aria-label={label}>
      <div className="tm-landing-device-screen">
        <div className="lpm-vp">
          <div className="lpm-status">
            <span>9:41</span>
            <span className="lpm-status-icons"><i /><i /></span>
          </div>
          <div className="lpm-screens">{children}</div>
          <div className="lpm-tabbar">
            {TABS.map(({ key, label: tabLabel, Icon }) => (
              <span key={key} className="lpm-tab" data-tab={key} data-on={key === activeTab}>
                <span className="lpm-tab-ic"><Icon size={24} /></span>
                {tabLabel}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 목업 안의 한 화면. 투어 스테이지에서는 여러 장을 겹쳐 두고 data-on 으로 교체한다. */
export function LandingScreen({
  kind,
  tabKey,
  on,
  children,
}: {
  kind: 'home' | 'match' | 'team' | 'bracket' | 'live' | 'card';
  tabKey: LandingTabKey;
  on: boolean;
  children: ReactNode;
}) {
  return (
    <div className="lpm-screen" data-screen={kind} data-tab-key={tabKey} data-on={on}>
      {children}
    </div>
  );
}
