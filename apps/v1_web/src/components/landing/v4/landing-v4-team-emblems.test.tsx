import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingV4MatchCard } from './landing-v4-now-fx';
import { EXAMPLE_TEAM_MATCHES, SceneApply, SceneFind } from './landing-v4-stage-scenes';
import type { LandingLiveTeamMatch } from '@/lib/landing/landing-v4-data';
import { resolveTeamLogoUrl } from '@/lib/team-logo-presets';
import { publicAssetPath } from '@/lib/assets';
import { resolveNextImageSrc } from '@/test/next-image';

function realMatch(overrides: Partial<LandingLiveTeamMatch> = {}): LandingLiveTeamMatch {
  return {
    kind: 'team_match',
    id: 'synthetic-match-id',
    hostTeamId: 'synthetic-host-team-id',
    opponentTeamId: 'synthetic-opponent-team-id',
    hostName: '홈팀',
    opponentName: '상대팀',
    hostLogoUrl: null,
    opponentLogoUrl: null,
    region: '서울',
    place: null,
    dateTimeText: '토요일 19:00',
    formatText: '5:5',
    levelLabel: null,
    isLeague: false,
    href: '/team-matches',
    ...overrides,
  };
}

function displayedSources(container: ParentNode, selector: string) {
  return Array.from(container.querySelectorAll(`${selector} img`))
    .map((image) => resolveNextImageSrc(image));
}

describe('landing team emblems', () => {
  it('shows local presets for real null-logo teams in the moving match card', () => {
    const match = realMatch();
    const { container } = render(<LandingV4MatchCard match={match} />);
    const sources = displayedSources(container, '.tm-landing-v4-mcard-logos');

    expect(sources).toEqual([
      resolveTeamLogoUrl({ teamId: match.hostTeamId, logoUrl: null }),
      resolveTeamLogoUrl({ teamId: match.opponentTeamId, logoUrl: null }),
    ]);
    expect(sources[0]).not.toBe(sources[1]);
  });

  it('shows local presets in both stage match scenes and preserves a saved upload', () => {
    const match = realMatch({ hostLogoUrl: '/uploads/teams/synthetic-home.png' });

    const find = render(<SceneFind matches={[match]} countText={null} example={false} />);
    const findSources = displayedSources(find.container, '.tm-landing-v4-sm-logos');
    expect(findSources).toEqual([
      publicAssetPath('/uploads/teams/synthetic-home.png'),
      resolveTeamLogoUrl({ teamId: match.opponentTeamId, logoUrl: null }),
    ]);
    find.unmount();

    const applyMatch = realMatch();
    const apply = render(<SceneApply match={applyMatch} example={false} />);
    const sources = displayedSources(apply.container, '.tm-landing-v4-sm-logos');
    expect(sources).toEqual([
      resolveTeamLogoUrl({ teamId: applyMatch.hostTeamId, logoUrl: null }),
      resolveTeamLogoUrl({ teamId: applyMatch.opponentTeamId, logoUrl: null }),
    ]);
    expect(sources[0]).not.toBe(sources[1]);
  });

  it('keeps unknown opponents and demo matches on the neutral fallback', () => {
    const missingOpponent = realMatch({ opponentTeamId: null });
    const card = render(<LandingV4MatchCard match={missingOpponent} />);
    const cardLogos = card.container.querySelector('.tm-landing-v4-mcard-logos');
    const cardAvatars = cardLogos?.querySelectorAll(':scope > div');
    expect(cardAvatars).toHaveLength(2);
    expect(cardAvatars?.[0].querySelector('img')).not.toBeNull();
    expect(cardAvatars?.[1].querySelector('img')).toBeNull();
    card.unmount();

    const demos = render(<SceneFind matches={EXAMPLE_TEAM_MATCHES} countText={null} example />);
    expect(displayedSources(demos.container, '.tm-landing-v4-sm-logos')).toEqual([]);
  });
});
