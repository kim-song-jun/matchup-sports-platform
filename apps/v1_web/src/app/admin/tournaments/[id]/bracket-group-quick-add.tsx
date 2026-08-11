'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useV1CreateGroup } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminBracketGroup, V1TournamentGroupPhase } from '@/types/api';
import { GROUP_PHASE_TEMPLATES, templateFor } from './bracket-group-helpers';
import { inputCls, submitBtnCls } from './bracket-shared-styles';

interface BracketGroupQuickAddProps {
  existingGroups: V1AdminBracketGroup[];
  createGroup: ReturnType<typeof useV1CreateGroup>;
  showToast: (msg: string, v?: 'success' | 'error') => void;
  /** 조 생성 성공 시 호출 — 새로 만든 조 id를 넘겨 그 카드로 자동 스크롤한다. */
  onCreated: (groupId: string) => void;
}

/** "조 만들기" — 단계 템플릿 1클릭 생성 + "직접 입력" 폴백(기존 자유입력 폼 그대로 유지). */
export function BracketGroupQuickAdd({ existingGroups, createGroup, showToast, onCreated }: BracketGroupQuickAddProps) {
  const [customMode, setCustomMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupPhase, setGroupPhase] = useState<V1TournamentGroupPhase>('group');
  const [groupAdvanceCount, setGroupAdvanceCount] = useState('');

  function submitTemplate(phase: V1TournamentGroupPhase) {
    const { name } = templateFor(phase, existingGroups);
    createGroup.mutate(
      { name, phase },
      {
        onSuccess: (created) => {
          showToast('조를 만들었어요.', 'success');
          onCreated(created.id);
        },
        onError: (err) => showToast(extractErrorMessage(err, '조 생성에 실패했어요.'), 'error'),
      },
    );
  }

  function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    const parsedAdvance = Number.parseInt(groupAdvanceCount, 10);
    const advanceCount = Number.isInteger(parsedAdvance) && parsedAdvance > 0 ? parsedAdvance : undefined;
    createGroup.mutate(
      { name: groupName.trim(), phase: groupPhase, ...(advanceCount != null ? { advanceCount } : {}) },
      {
        onSuccess: (created) => {
          setGroupName('');
          setGroupAdvanceCount('');
          showToast('조를 만들었어요.', 'success');
          onCreated(created.id);
        },
        onError: (err) => showToast(extractErrorMessage(err, '조 생성에 실패했어요.'), 'error'),
      },
    );
  }

  return (
    <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-5">
      <h3 className="text-[15px] font-bold text-[var(--text-strong)] mb-1">조 추가</h3>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        탭 한 번으로 조를 만들어요. 이름은 나중에 수정 아이콘으로 바꿀 수 있어요.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="조 유형 템플릿">
        {GROUP_PHASE_TEMPLATES.map(({ phase, label }) => (
          <button
            key={phase}
            type="button"
            onClick={() => submitTemplate(phase)}
            disabled={createGroup.isPending}
            className="inline-flex items-center justify-center h-[44px] px-4 rounded-xl text-[13px] font-semibold text-[var(--blue700)] bg-[var(--blue50)] border border-[var(--tint-blue-border)] hover:bg-blue-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Plus size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setCustomMode((v) => !v)}
        className="mt-3 inline-flex items-center min-h-[44px] text-xs text-[var(--text-muted)] hover:text-[var(--blue700)] underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        aria-expanded={customMode}
      >
        직접 입력 {customMode ? '닫기' : '›'}
      </button>
      {customMode && (
        <form
          onSubmit={submitCustom}
          noValidate
          className="mt-3 pt-4 border-t border-[var(--border)] flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="group-name" className="text-[13px] text-[var(--text-strong)]">
              조 이름
            </label>
            <input
              id="group-name"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="예: A조"
              disabled={createGroup.isPending}
              maxLength={20}
              className={inputCls + ' sm:w-[180px]'}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="group-phase" className="text-[13px] text-[var(--text-strong)]">
              단계
            </label>
            <select
              id="group-phase"
              value={groupPhase}
              onChange={(e) => setGroupPhase(e.target.value as V1TournamentGroupPhase)}
              disabled={createGroup.isPending}
              className={inputCls + ' sm:w-[120px]'}
            >
              <option value="group">조별</option>
              <option value="semi">준결승</option>
              <option value="final">결승</option>
              <option value="third_place">3위 결정전</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="group-advance" className="text-[13px] text-[var(--text-strong)]">
              진출 팀 수 <span className="text-xs text-[var(--text-muted)]">(선택)</span>
            </label>
            <input
              id="group-advance"
              type="number"
              inputMode="numeric"
              min={1}
              value={groupAdvanceCount}
              onChange={(e) => setGroupAdvanceCount(e.target.value)}
              placeholder="예: 2"
              disabled={createGroup.isPending}
              className={inputCls + ' sm:w-[110px]'}
            />
          </div>
          <button type="submit" disabled={!groupName.trim() || createGroup.isPending} className={submitBtnCls}>
            <Plus size={14} aria-hidden="true" />
            조 추가
          </button>
        </form>
      )}
    </div>
  );
}
