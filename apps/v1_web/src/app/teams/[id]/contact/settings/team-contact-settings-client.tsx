'use client';

import { useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import {
  useV1RemoveTeamContactBlock,
  useV1TeamContactBlocks,
  useV1TeamDetail,
  useV1UpdateContactPolicy,
  type V1ContactPolicy,
} from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { formatMonthDay } from '@/lib/date-utils';

// 각 옵션에 한 줄 설명을 붙인다. 특히 recruiting_only 는 이름만으로는 "왜 컨택이 안 오지?" 를
// 유발하기 쉬워서, 무엇을 기준으로 열리고 닫히는지 풀어 쓴다.
const POLICY_OPTIONS: Array<{ value: V1ContactPolicy; label: string; description: string }> = [
  { value: 'open', label: '항상 받기', description: '어느 팀이든 컨택을 보낼 수 있어요.' },
  {
    value: 'recruiting_only',
    label: '모집 중일 때만 받기',
    description: '경기 상대를 구하는 중일 때만 받아요.',
  },
  { value: 'closed', label: '받지 않기', description: '지금은 아무도 컨택을 보낼 수 없어요.' },
];

export function TeamContactSettingsPageClient({ teamId }: { teamId: string }) {
  const teamQuery = useV1TeamDetail(teamId);
  const blocksQuery = useV1TeamContactBlocks(teamId);
  const updatePolicy = useV1UpdateContactPolicy(teamId);
  const removeBlock = useV1RemoveTeamContactBlock(teamId);
  const [error, setError] = useState<string | null>(null);

  // 정책의 진실은 팀 상세다 — PATCH 응답은 { id, contactPolicy } 만 돌려주므로 화면 상태를
  // 그 응답으로 끌고 가지 않는다. 성공 시 훅이 팀 상세를 무효화하고, 재조회된 값이 여기 반영된다.
  const currentPolicy: V1ContactPolicy = teamQuery.data?.contactPolicy ?? 'open';
  const blocks = blocksQuery.data?.items ?? [];
  const blocksErrorCode = blocksQuery.isError ? extractErrorCode(blocksQuery.error) : null;

  function handlePolicyChange(value: V1ContactPolicy) {
    if (value === currentPolicy) return;
    setError(null);
    updatePolicy.mutate(
      { contactPolicy: value },
      {
        onError: (err) =>
          setError(extractErrorMessage(err, '수신 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  }

  function handleRemoveBlock(blockedTeamId: string) {
    setError(null);
    removeBlock.mutate(blockedTeamId, {
      onError: (err) =>
        setError(extractErrorMessage(err, '차단을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.')),
    });
  }

  return (
    <AppChrome
      title="컨택 설정"
      activeTab="teams"
      bottomNav={false}
      backHref={`/teams/${teamId}`}
      desktopHead
    >
      <div style={{ display: 'grid', gap: 12, padding: '12px 0 24px' }}>
        <Card>
          <div className="tm-text-heading">컨택 수신 설정</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            {teamQuery.data?.name ?? '우리 팀'}에 다른 팀이 컨택을 보낼 수 있는 조건이에요.
          </div>

          <div role="radiogroup" aria-label="컨택 수신 설정" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {POLICY_OPTIONS.map((option) => {
              const selected = option.value === currentPolicy;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={updatePolicy.isPending}
                  onClick={() => handlePolicyChange(option.value)}
                  className="tm-card-row"
                  style={{
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    textAlign: 'left',
                    width: '100%',
                    borderRadius: 10,
                    border: `1px solid ${selected ? 'var(--blue500)' : 'var(--border)'}`,
                    background: selected ? 'var(--blue50)' : 'var(--surface)',
                  }}
                >
                  {/* 선택 상태를 색으로만 알리지 않는다 — 체크 표시와 '선택됨' 텍스트를 함께 둔다. */}
                  <span aria-hidden="true" style={{ color: selected ? 'var(--blue500)' : 'var(--text-muted)' }}>
                    {selected ? '◉' : '○'}
                  </span>
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span className="tm-text-label">
                      {option.label}
                      {selected ? ' · 선택됨' : null}
                    </span>
                    <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="tm-text-heading">차단한 팀</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            차단한 팀은 우리 팀에 컨택을 보낼 수 없어요.
          </div>

          {blocksQuery.isLoading ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 12 }}>
              불러오는 중이에요.
            </div>
          ) : blocksQuery.isError ? (
            // 403 을 빈 목록으로 위장하면 안 된다 — 운영진이 아닌 사람에게 "차단한 팀이 없어요" 를
            // 보여주면 권한 문제를 데이터 없음으로 오해하고, 실제 차단이 있는데도 없는 줄 안다.
            blocksErrorCode === 'PERMISSION_DENIED' ? (
              <EmptyState title="차단 목록을 볼 권한이 없어요" sub="팀장과 운영진만 볼 수 있어요." />
            ) : (
              <EmptyState
                title="차단 목록을 불러오지 못했어요"
                sub="잠시 후 다시 시도해 주세요."
                cta="다시 시도"
                onCta={() => void blocksQuery.refetch()}
              />
            )
          ) : blocks.length === 0 ? (
            <EmptyState title="차단한 팀이 없어요" sub="컨택을 받은 뒤 상대 팀을 차단하면 여기에 모여요." />
          ) : (
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 8 }}>
              {blocks.map((block) => {
                const nameId = `blocked-team-${block.blockedTeamId}`;
                return (
                  <li
                    key={block.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      minHeight: 44,
                    }}
                  >
                    <span style={{ display: 'grid', gap: 2 }}>
                      <span id={nameId} className="tm-text-label">
                        {block.blockedTeam.name}
                      </span>
                      <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                        {formatMonthDay(block.createdAt) ?? '날짜 미상'}에 차단함
                      </span>
                    </span>
                    {/* 버튼 이름은 '차단 해제' 로 두고, 어느 팀인지는 aria-describedby 로 전달한다 —
                        describedby 는 접근성 이름을 바꾸지 않으므로 목록 안에서 이름이 흐려지지 않는다. */}
                    <button
                      type="button"
                      className="tm-btn tm-btn-sm tm-btn-neutral"
                      style={{ minHeight: 44 }}
                      aria-describedby={nameId}
                      disabled={removeBlock.isPending}
                      onClick={() => handleRemoveBlock(block.blockedTeamId)}
                    >
                      차단 해제
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {error ? (
          <div role="status" className="tm-text-caption" style={{ color: 'var(--red700)', padding: '0 4px' }}>
            {error}
          </div>
        ) : null}
      </div>
    </AppChrome>
  );
}
