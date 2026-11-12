'use client';

import { useContext, useId } from 'react';
import { FixtureAssignmentContext } from './fixture-assignment-context';
import { useFixtureScheduleTimes } from '@/hooks/use-fixture-schedule-times';
import { assignmentTimes } from '@/lib/fixture-assignment';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminBracketFixture } from '@/types/api';

type Props = { tournamentId: string; fixtures: readonly V1AdminBracketFixture[]; value: string; onChange: (value: string) => void; disabled: boolean };
export function FixtureTimePicker(props: Props) {
  const enabled = useContext(FixtureAssignmentContext);
  return enabled ? <Choices {...props} /> : null;
}
function Choices({ tournamentId, fixtures, value, onChange, disabled }: Props) {
  const id = useId();
  const query = useFixtureScheduleTimes(tournamentId);
  const current = value ? kstDatetimeLocalToIso(value) : null;
  const choices = assignmentTimes(fixtures, query.data?.items ?? []);
  if (current && !choices.includes(current)) choices.push(current);
  return <div className="flex flex-col gap-1">
    <label htmlFor={id} className="tm-text-label">등록된 시간에서 선택</label>
    <select id={id} className="tm-input" value={current ?? ''} disabled={disabled || query.isPending || query.isError}
      onChange={event => onChange(isoToKstDatetimeLocal(event.target.value || null))}>
      <option value="">시간 미정</option>
      {choices.sort().map(time => <option key={time} value={time}>{formatKstDateShort(time)} {formatKstTime(time)}</option>)}
    </select>
    {query.isError ? <div role="alert" className="tm-text-caption text-[var(--red700)]">{extractErrorMessage(query.error, '시간 목록을 불러오지 못했어요.')} <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost min-h-11" onClick={() => void query.refetch()}>다시 불러오기</button></div> : null}
    <p className="tm-text-caption text-[var(--text-muted)]">아래에서 시간을 직접 입력할 수도 있어요.</p>
  </div>;
}
