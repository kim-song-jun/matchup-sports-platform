'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { ActionMenu } from '@/components/v1-ui/action-menu';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import { Button } from '@/components/v1-ui/button';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { BRACKET_CANVAS_WIDE_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { isBracketPublished } from '@/lib/bracket-visibility';
import type { V1Tournament } from '@/types/api';
import { BracketPublishControl } from './bracket-publish-control';
import type { BracketTools } from './use-bracket-tools';
import type { BracketViewControls } from './use-bracket-view-controls';

type BracketView = 'canvas' | 'list';

const VIEW_ITEMS = [
  { id: 'canvas', label: '그림' },
  { id: 'list', label: '목록' },
];

export function BracketToolsBar({ tools, tournament, tournamentId, canWrite, view, onViewChange, controls, showToast, children }: {
  tools: BracketTools;
  tournament: V1Tournament | undefined;
  tournamentId: string;
  canWrite: boolean;
  view: BracketView;
  onViewChange: (view: BracketView) => void;
  controls: BracketViewControls;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  /** 도구 줄 아래의 본문. 폰의 공개 막대가 본문 뒤에 붙어야 화면 아래에 고정되므로 이 컴포넌트가 함께 그린다. */
  children?: ReactNode;
}) {
  const wide = useMediaQuery(BRACKET_CANVAS_WIDE_MEDIA_QUERY);
  // 대진이 없으면 도구 줄 대신 빈 상태가 길을 안내한다. 목록 보기에서는 그림으로 돌아가는 전환만 남긴다.
  if (tools.isEmpty && view === 'canvas') return <>{children}{tools.dialogs}</>;

  const { teamFill, match, timeVenue } = tools.menus;
  const menus: Array<{ label: string; actions: ActionSheetAction[] }> = [
    { label: '팀 채우기', actions: teamFill },
    { label: '경기', actions: match },
    { label: '시간·구장', actions: timeVenue },
  ];
  const showMenus = !tools.isEmpty && menus.every((menu) => menu.actions.length > 0);
  const showPublish = !tools.loading && !tools.isEmpty;
  const publishProps = {
    tournamentId,
    canWrite,
    bracketPublishedAt: tournament?.bracketPublishedAt,
    bracketPublishScheduledAt: tournament?.bracketPublishScheduledAt,
    registrationDeadlineAt: tournament?.registrationDeadlineAt,
    tournamentStatus: tournament?.status,
    hasGroups: tools.hasGroups,
    summary: tools.summary,
    showToast,
  };
  const published = isBracketPublished(tournament?.bracketPublishedAt, tournament?.bracketPublishScheduledAt);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {wide ? (
          <SegmentedTabs ariaLabel="대진 보기 방식" role="tablist" items={VIEW_ITEMS} activeId={view} onSelect={(id) => onViewChange(id === 'list' ? 'list' : 'canvas')} />
        ) : null}
        {showMenus ? (
          <div className={wide ? 'flex flex-wrap items-center gap-2' : 'grid w-full grid-cols-3 gap-2'}>
            {menus.map((menu) => (
              <div key={menu.label} className="flex min-w-0 [&>span]:w-full md:[&>span]:w-auto">
                <ActionMenu
                  label={menu.label}
                  actions={menu.actions}
                  trigger={(trigger) => (
                    <Button variant="outline" size="md" className={wide ? undefined : 'w-full'} onClick={trigger.onToggle}
                      aria-expanded={trigger['aria-expanded']} aria-haspopup={trigger['aria-haspopup']}>
                      {menu.label}
                      <ChevronDown size={16} aria-hidden="true" />
                    </Button>
                  )}
                />
              </div>
            ))}
          </div>
        ) : null}
        {wide && showPublish ? (
          <div className="ml-auto">
            <BracketPublishControl {...publishProps} layout="inline" />
          </div>
        ) : null}
      </div>

      {controls.unscheduledOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="tm-text-caption text-[var(--text-muted)]">시간 미정 {tools.unscheduledCount}경기만 보는 중 ·</span>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost min-h-11" onClick={() => controls.setUnscheduledOnly(false)}>모두 보기</button>
        </div>
      ) : null}
      {tools.resetError ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{tools.resetError}</p> : null}
      {published && canWrite && !tools.isEmpty ? <AlertBanner tone="warning" message="이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요." /> : null}

      {children}
      {!wide && showPublish ? <BracketPublishControl {...publishProps} layout="bar" /> : null}
      {tools.dialogs}
    </div>
  );
}
