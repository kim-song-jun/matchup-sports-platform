'use client';

import { useId, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
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
// savedResult 는 즉시 저장 뒤 카드에 남기는 결과 한 줄이다.
const POLICY_OPTIONS: Array<{ value: V1ContactPolicy; label: string; description: string; savedResult: string }> = [
  {
    value: 'open',
    label: '항상 받기',
    description: '어느 팀이든 컨택을 보낼 수 있어요.',
    savedResult: '이제 어느 팀이든 컨택을 보낼 수 있어요.',
  },
  {
    value: 'recruiting_only',
    label: '모집 중일 때만 받기',
    description: '경기 상대를 구하는 중일 때만 받아요.',
    savedResult: '이제 경기 상대를 구하는 중일 때만 컨택을 받아요.',
  },
  {
    value: 'closed',
    label: '받지 않기',
    description: '지금은 아무도 컨택을 보낼 수 없어요.',
    savedResult: '이제 다른 팀은 컨택을 보낼 수 없어요.',
  },
];

export function TeamContactSettingsPageClient({ teamId }: { teamId: string }) {
  const teamQuery = useV1TeamDetail(teamId);
  const blocksQuery = useV1TeamContactBlocks(teamId);
  const updatePolicy = useV1UpdateContactPolicy(teamId);
  const removeBlock = useV1RemoveTeamContactBlock(teamId);
  const [error, setError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [savedPolicy, setSavedPolicy] = useState<V1ContactPolicy | null>(null);
  const idPrefix = useId();

  // 정책의 진실은 팀 상세다 — PATCH 응답은 { id, contactPolicy } 만 돌려주므로 화면 상태를
  // 그 응답으로 끌고 가지 않는다. 성공 시 훅이 팀 상세를 무효화하고, 재조회된 값이 여기 반영된다.
  const currentPolicy: V1ContactPolicy = teamQuery.data?.contactPolicy ?? 'open';
  const blocks = blocksQuery.data?.items ?? [];
  const blocksErrorCode = blocksQuery.isError ? extractErrorCode(blocksQuery.error) : null;
  // 팀 상세가 새 값으로 다시 읽힌 뒤에만 알린다 — 라디오와 안내가 서로 다른 값을 말하지 않게.
  const savedOption =
    savedPolicy !== null && savedPolicy === currentPolicy
      ? POLICY_OPTIONS.find((option) => option.value === savedPolicy)
      : undefined;

  function handlePolicyChange(value: V1ContactPolicy) {
    if (value === currentPolicy) return;
    setPolicyError(null);
    setSavedPolicy(null);
    updatePolicy.mutate(
      { contactPolicy: value },
      {
        onSuccess: () => setSavedPolicy(value),
        onError: (err) =>
          setPolicyError(extractErrorMessage(err, '수신 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')),
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
      <div
        style={{
          display: 'grid',
          gap: 12,
          paddingTop: 12,
          paddingBottom: 24,
          paddingLeft: 'var(--v1-shell-page-x)',
          paddingRight: 'var(--v1-shell-page-x)',
        }}
      >
        <Card>
          <div className="tm-text-heading">컨택 수신 설정</div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
            {teamQuery.data?.name ?? '우리 팀'}에 다른 팀이 컨택을 보낼 수 있는 조건이에요.
          </div>

          {/* 네이티브 라디오를 쓴다. button + role="radio" 로는 방향키 이동·단일 tab stop 을
              직접 구현해야 하고(저장소 다른 화면들이 그 상태다), 빼먹으면 키보드·스크린리더
              사용자가 그룹으로 조작할 수 없다. 네이티브는 그 동작이 전부 공짜다. */}
          <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
            <legend className="tm-text-label" style={{ padding: 0 }}>
              누가 컨택을 보낼 수 있나요?
            </legend>
            {POLICY_OPTIONS.map((option) => {
              const selected = option.value === currentPolicy;
              const inputId = `${idPrefix}-policy-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={inputId}
                  style={{
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 12px',
                    borderRadius: 'var(--radius-control)',
                    cursor: updatePolicy.isPending ? 'default' : 'pointer',
                    border: `1px solid ${selected ? 'var(--blue500)' : 'var(--border)'}`,
                    background: selected ? 'var(--blue50)' : 'var(--surface)',
                  }}
                >
                  <input
                    type="radio"
                    id={inputId}
                    name={`${idPrefix}-contact-policy`}
                    value={option.value}
                    checked={selected}
                    disabled={updatePolicy.isPending}
                    onChange={() => handlePolicyChange(option.value)}
                  />
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span className="tm-text-label">{option.label}</span>
                    <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div
            role="status"
            aria-live="polite"
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, minHeight: 24, color: 'var(--green700)' }}
          >
            {savedOption ? (
              <>
                <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden="true" />
                <span className="tm-text-caption" style={{ color: 'var(--green700)', fontWeight: 600 }}>
                  저장했어요. {savedOption.savedResult}
                </span>
              </>
            ) : null}
          </div>
          {policyError ? (
            <div role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
              {policyError}
            </div>
          ) : null}
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
              <EmptyState title="차단 목록을 볼 권한이 없어요" sub="팀장·매니저만 볼 수 있어요." />
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
                      {/* 운영자가 신고를 근거로 대리 차단하면 이 팀 운영진은 자기가 만들지 않은
                          차단을 보게 된다. 사유가 없으면 "이게 왜 여기 있지?" 가 되므로, 사유가
                          있을 때만 한 줄 덧붙인다 — 빈 줄이 생기면 안 된다. */}
                      {block.reason ? (
                        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                          {block.reason}
                        </span>
                      ) : null}
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
          <div role="alert" className="tm-text-caption" style={{ color: 'var(--red700)', padding: '0 4px' }}>
            {error}
          </div>
        ) : null}
      </div>
  );
}
