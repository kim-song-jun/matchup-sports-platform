import { basicSection } from './basic-section';
import { entrySection } from './entry-section';
import { promoSection } from './promo-section';
import { publicSection } from './public-section';
import { rulesSection } from './rules-section';
import { scheduleSection } from './schedule-section';
import type { InfoSectionDefinition } from './types';

/** 화면에 놓이는 순서 — `TOURNAMENT_INFO_SECTIONS` 와 같다. */
export const INFO_SECTIONS: readonly InfoSectionDefinition[] = [
  basicSection,
  scheduleSection,
  entrySection,
  rulesSection,
  publicSection,
  promoSection,
];
