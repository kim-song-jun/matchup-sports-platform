import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filterTeamMembers, TeamMembersSection } from './team-members-section';

const members = [
  { name: 'Kim Minsu', jerseyNumber: 7 },
  { name: '박서준', jerseyNumber: 17 },
  { name: '이도윤', jerseyNumber: 70 },
  { name: '최7번', jerseyNumber: null },
  { name: '정하늘', jerseyNumber: undefined },
];
const names = (query: string) => filterTeamMembers(members, query).map((member) => member.name);

describe('filterTeamMembers', () => {
  it('이름 일부로 대소문자 없이 찾고, 빈 검색어는 전원이다', () => {
    expect(names('min')).toEqual(['Kim Minsu']);
    expect(names('서준')).toEqual(['박서준']);
    expect(names('  ')).toEqual(members.map((member) => member.name));
  });

  it("'7'·'7번' 은 등번호 7 과 정확히 같은 사람만 — 17·70 은 아니고, 이름에 7 이 든 사람은 이름으로 걸린다", () => {
    expect(names('7')).toEqual(['Kim Minsu', '최7번']);
    expect(names(' 7번 ')).toEqual(['Kim Minsu', '최7번']);
    expect(names('17번')).toEqual(['박서준']);
  });
});

describe('TeamMembersSection 기본 아이콘', () => {
  it('이름과 무관한 사람 아이콘을 표시하고 실제 이름은 그대로 보인다', () => {
    const member = (id: string, name: string) => ({ id, name, role: '멤버', meta: '', actions: [] });
    const { container } = render(
      createElement(TeamMembersSection, { members: [member('m-1', '(QA0929)선수11'), member('m-2', '김하나')] }),
    );

    const avatars = container.querySelectorAll('.tm-member-initial');
    expect(avatars).toHaveLength(2);
    for (const avatar of avatars) {
      expect(avatar.querySelector('svg')).toHaveClass('lucide-user-round');
      expect(avatar.textContent).toBe('');
    }
    expect(screen.getByText('(QA0929)선수11')).toBeInTheDocument();
    expect(screen.getByText('김하나')).toBeInTheDocument();
  });
});
