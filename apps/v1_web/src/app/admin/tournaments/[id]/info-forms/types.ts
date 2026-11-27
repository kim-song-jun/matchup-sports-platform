import type { ReactElement, Ref } from 'react';
import type { SaveContext } from '@/hooks/use-tournament-save-context';
import type { TournamentPeriodSettingsResponse } from '@/hooks/use-tournament-period-settings';
import type { SaveStep } from '@/lib/sequential-save';
import type { V1LineupSizeOptions, V1Tournament } from '@/types/api';
import type { TournamentInfoSectionKey } from '../info-sections';

export type BuildResult =
  | { ok: true; steps: SaveStep[] }
  | { ok: false; message: string; fieldId: string };

/** 시트의 「저장」이 폼에게 묻는 것 — 지금 입력으로 보낼 호출 목록, 또는 막는 칸과 이유. */
export interface InfoSectionFormHandle {
  buildSteps(ctx: SaveContext): BuildResult;
}

export interface InfoSectionFormProps {
  /** 시트를 연 순간의 대회 — 저장 중에 캐시가 바뀌어도 폼의 기준은 움직이지 않는다. */
  base: V1Tournament;
  disabled: boolean;
  ref: Ref<InfoSectionFormHandle>;
  onDirtyChange(dirty: boolean): void;
  /** 업로드처럼 저장을 잠시 막아야 하는 일이 진행 중인가. */
  onBusyChange(busy: boolean): void;
}

export type InfoSummaryBadgeTone = 'needed' | 'default' | 'optional' | 'off';

export interface InfoSummaryRow {
  key: string;
  label: string;
  value: string;
  note?: string;
  badge?: { tone: InfoSummaryBadgeTone; text: string };
}

export interface InfoSummaryContext {
  tournament: V1Tournament;
  sportName?: string;
  lineupOptions?: V1LineupSizeOptions;
  periods?: TournamentPeriodSettingsResponse;
}

export interface InfoSectionDefinition {
  key: TournamentInfoSectionKey;
  rows(ctx: InfoSummaryContext): InfoSummaryRow[];
  Form(props: InfoSectionFormProps): ReactElement;
}
