'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ActionSheet, type ActionSheetAction } from '@/components/v1-ui/action-sheet';
import { SearchIcon } from '@/components/v1-ui/icons';
import type { TeamMemberRowModel } from './teams.types';

/** 이 인원부터 이름·등번호 검색을 둔다 — 그보다 적으면 한 화면에 다 보여 검색이 자리만 차지한다(H2 A-1). */
export const MEMBER_SEARCH_MIN = 8;

const RISKY_GROUP_LABEL = '되돌리기 어려운 동작';

/** 이름 일부 또는 등번호('7', '7번')로 찾는다. */
export function filterTeamMembers<T extends Pick<TeamMemberRowModel, 'name' | 'jerseyNumber'>>(members: readonly T[], query: string): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return members;
  const jersey = /^\d+번?$/.test(needle) ? needle.replace('번', '') : null;
  return members.filter(
    (member) =>
      member.name.toLowerCase().includes(needle) ||
      (jersey !== null && member.jerseyNumber !== null && member.jerseyNumber !== undefined && String(member.jerseyNumber) === jersey),
  );
}

/**
 * 멤버 탭 — 행 64px 에 ⋯ 하나, 동작은 시트에서 고른다(H2 A-1·A-2). 시트는 위험하지 않은 동작을 위에,
 * 되돌리기 어려운 동작(팀장 넘기기·내보내기·나가기)을 소제목 아래로 떼어 둔다.
 */
export function TeamMembersSection({ members, loading = false }: { members: readonly TeamMemberRowModel[]; loading?: boolean }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const searchable = members.length >= MEMBER_SEARCH_MIN;
  const filtering = searchable && query.trim().length > 0;
  const visible = filtering ? filterTeamMembers(members, query) : members;
  const openMember = members.find((member) => member.id === openId) ?? null;

  if (loading) {
    return (
      <div className="tm-member-section" aria-busy="true" aria-label="멤버 불러오는 중">
        {[0, 1, 2].map((i) => <div key={i} className="tm-review-skeleton" style={{ height: 56, marginTop: 8, borderRadius: 'var(--radius-control)' }} aria-hidden="true" />)}
      </div>
    );
  }

  return (
    <section className="tm-member-section" aria-label="멤버">
      {searchable ? (
        <div className="tm-list-search-input tm-list-search-input-field" style={{ marginBottom: 16 }}>
          <label htmlFor={searchId} className="sr-only">멤버 검색</label>
          <input
            id={searchId}
            type="search"
            className="tm-list-search-field"
            placeholder="멤버 이름·등번호 검색"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button className="tm-list-search-clear" type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}>×</button>
          ) : (
            <span className="tm-list-search-submit" aria-hidden="true" style={{ color: 'var(--text-caption)' }}>
              <SearchIcon size={19} strokeWidth={2} />
            </span>
          )}
        </div>
      ) : null}
      <p className="tm-text-caption" role="status" style={{ margin: 0, color: 'var(--text-caption)' }}>
        {filtering ? `검색 결과 ${visible.length}명` : `멤버 ${members.length}명`}
      </p>
      {visible.length === 0 ? (
        <p className="tm-text-caption" style={{ margin: '12px 0 0' }}>‘{query.trim()}’에 맞는 멤버가 없어요.</p>
      ) : (
        <ul className="tm-member-rows">
          {visible.map((member) => (
            <li key={member.id}>
              <TeamMemberRow member={member} onOpen={() => setOpenId(member.id)} />
            </li>
          ))}
        </ul>
      )}
      <ActionSheet
        open={openMember !== null}
        title={openMember?.name ?? ''}
        subtitle={openMember ? `${openMember.role} · ${openMember.meta}` : undefined}
        actions={openMember ? toSheetActions(openMember, () => setOpenId(null)) : []}
        onClose={() => setOpenId(null)}
      />
    </section>
  );
}

function TeamMemberRow({ member, onOpen }: { member: TeamMemberRowModel; onOpen: () => void }) {
  const body = (
    <>
      <span className="tm-member-row-name">
        <span className="tm-text-body line-clamp-1" style={{ color: 'var(--text-strong)', lineHeight: 1.35 }}>{member.name}</span>
        {member.roleTone ? (
          <span className={`tm-badge tm-badge-sm ${member.roleTone === 'owner' ? 'tm-badge-blue' : 'tm-badge-grey'}`}>{member.role}</span>
        ) : null}
      </span>
      <span className="tm-text-caption line-clamp-1" style={{ display: 'block', marginTop: 2 }}>{member.meta}</span>
    </>
  );
  return (
    <div className={member.highlighted ? 'tm-member-row tm-member-row-highlight' : 'tm-member-row'}>
      <span aria-hidden="true" className="tm-member-initial">{Array.from(member.name)[0] ?? '?'}</span>
      {member.profileHref ? (
        <Link className="tm-member-row-main tm-pressable" href={member.profileHref}>{body}</Link>
      ) : (
        <div className="tm-member-row-main">{body}</div>
      )}
      {member.actions.length > 0 ? (
        <button
          className="tm-btn tm-btn-icon tm-btn-ghost"
          type="button"
          aria-label={`${member.name} 관리`}
          aria-haspopup="dialog"
          disabled={member.actionPending}
          onClick={onOpen}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function toSheetActions(member: TeamMemberRowModel, close: () => void): ActionSheetAction[] {
  // 위험 동작은 원래 순서를 지킨 채 맨 아래 묶음으로 보낸다.
  const ordered = [...member.actions.filter((action) => !action.risky), ...member.actions.filter((action) => action.risky)];
  return ordered.map((action) => ({
    key: action.key,
    label: action.label,
    description: action.description,
    destructive: action.destructive,
    groupLabel: action.risky ? RISKY_GROUP_LABEL : undefined,
    disabled: Boolean(action.disabledReason),
    disabledReason: action.disabledReason,
    // 시트를 먼저 닫아야 뒤이어 뜨는 확인 창과 겹치지 않는다(ActionSheet 계약).
    onSelect: () => {
      close();
      action.onSelect();
    },
  }));
}
