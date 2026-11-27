'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { revealAndFocus } from '@/components/v1-ui/reveal-and-focus';
import { SIDE_SHEET_DISCARD_CONFIRM, SideSheet } from '@/components/v1-ui/side-sheet';
import { useTournamentSaveContext } from '@/hooks/use-tournament-save-context';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { runSaveSteps, type SaveStep } from '@/lib/sequential-save';
import type { V1Tournament } from '@/types/api';
import { infoFieldId } from './info-forms/form-kit';
import type { InfoSectionDefinition, InfoSectionFormHandle } from './info-forms/types';
import { TOURNAMENT_INFO_SECTION_META } from './info-sections';

const VERSION_CONFLICT_MESSAGE =
  '다른 곳에서 먼저 저장돼서 이번 저장은 반영되지 않았어요. 입력한 내용은 그대로 두었어요. 다시 저장해 주세요.';

function failureReason(error: unknown, step: SaveStep): string {
  if (extractErrorCode(error) === 'TOURNAMENT_VERSION_CONFLICT') return VERSION_CONFLICT_MESSAGE;
  return extractErrorMessage(error, `${step.label} 저장에 실패했어요.`);
}

/**
 * 섹션 하나의 수정 시트. 열 때마다 새로 마운트해 그 순간의 대회를 기준으로 삼는다.
 * 「저장」 한 번이 폼이 만든 호출을 순서대로 보내고, 실패하면 끝난 호출은 빼고 남은 것만 다시 보낸다.
 */
export function InfoSectionSheet({
  definition,
  initialTournament,
  focusField,
  onClose,
  onSaved,
}: {
  definition: InfoSectionDefinition;
  initialTournament: V1Tournament;
  /** 열리면서 초점을 둘 칸(`infoFieldId` 의 인자). */
  focusField?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { title, description } = TOURNAMENT_INFO_SECTION_META[definition.key];
  const [base] = useState(() => initialTournament);
  const saveContext = useTournamentSaveContext(base.id);
  const formRef = useRef<InfoSectionFormHandle>(null);
  const completedRef = useRef(new Set<string>());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, ConfirmModal } = useConfirm();
  const Form = definition.Form;

  useEffect(() => {
    if (focusField) document.getElementById(infoFieldId(focusField))?.focus();
  }, [focusField]);

  const save = async () => {
    const built = formRef.current?.buildSteps(saveContext);
    if (!built) return;
    if (!built.ok) {
      setMessage(built.message);
      revealAndFocus(document.getElementById(built.fieldId));
      return;
    }
    if (built.steps.length === 0) {
      onSaved('변경된 내용이 없어요.');
      onClose();
      return;
    }
    setMessage(null);
    setSaving(true);
    const outcome = await runSaveSteps(built.steps, completedRef.current, failureReason);
    for (const key of outcome.done) completedRef.current.add(key);
    setSaving(false);
    if (outcome.status === 'failed') {
      setMessage(outcome.message);
      return;
    }
    onSaved(`${title} 설정을 저장했어요.`);
    onClose();
  };

  const cancel = async () => {
    if (!(dirty || saving) || (await confirm(SIDE_SHEET_DISCARD_CONFIRM))) onClose();
  };

  return (
    <>
      <SideSheet
        open
        title={title}
        onClose={onClose}
        dirty={dirty || saving}
        footer={
          <div className="flex flex-col gap-2">
            {message ? (
              <p role="alert" className="text-[length:var(--font-size-label)] text-[var(--red700)]">{message}</p>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="neutral" className="flex-1" onClick={() => void cancel()}>
                취소
              </Button>
              <Button type="button" variant="primary" className="flex-1" disabled={saving || busy} onClick={() => void save()}>
                {saving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>
        }
      >
        <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">{description}</p>
        <Form ref={formRef} base={base} disabled={saving} onDirtyChange={setDirty} onBusyChange={setBusy} />
      </SideSheet>
      {ConfirmModal}
    </>
  );
}
