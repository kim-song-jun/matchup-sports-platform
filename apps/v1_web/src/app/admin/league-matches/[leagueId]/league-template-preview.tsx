'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useV1LeagueTemplatePreview } from '@/hooks/use-v1-bracket-canvas';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1PreviewLeagueTemplatePayload } from '@/types/league-match';

interface LeagueTemplatePreviewProps {
  leagueId: string;
  /** null while the inputs are not valid yet — nothing is requested or shown. */
  request: V1PreviewLeagueTemplatePayload | null;
}

const seat = (position: number) => `${position}번 자리`;

export function LeagueTemplatePreview({ leagueId, request }: LeagueTemplatePreviewProps) {
  const { data, error, isFetching, isSettling } = useV1LeagueTemplatePreview(leagueId, request);
  if (request === null) return null;

  const busy = isSettling || (isFetching && data === undefined);
  const { checks } = data ?? { checks: null };
  const hasRuns = checks !== null && checks.backToBackRuns.length > 0;
  const hasGaps = checks !== null && (checks.duplicateMeetings > 0 || checks.missingMeetings > 0);

  return (
    <section aria-labelledby="league-template-preview-title" className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 md:max-w-2xl">
      <h3 id="league-template-preview-title" className="mb-2 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
        생성 미리보기
      </h3>
      <div aria-live="polite">
        {busy ? <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">시간표를 계산하고 있어요.</p> : null}
        {!busy && error !== null && data === undefined ? (
          <p className="text-[length:var(--font-size-caption)] text-[var(--red700)]">{extractErrorMessage(error, '미리보기를 불러오지 못했어요.')}</p>
        ) : null}
        {!busy && data !== undefined && checks !== null ? (
          <div className="space-y-1">
            <p className="flex items-start gap-2 text-[length:var(--font-size-caption)] text-[var(--text-strong)]">
              {hasGaps ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--orange700)]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green700)]" aria-hidden="true" />
              )}
              <span>
                {hasGaps
                  ? `중복 ${checks.duplicateMeetings}경기 · 빠진 경기 ${checks.missingMeetings}경기가 있어요.`
                  : '모든 팀이 서로 정해진 횟수만큼 만나요. 중복·누락 없음'}
              </span>
            </p>
            <p className="flex items-start gap-2 text-[length:var(--font-size-caption)] text-[var(--text-strong)]">
              {hasRuns ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--orange700)]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green700)]" aria-hidden="true" />
              )}
              <span>
                {hasRuns
                  ? `${checks.backToBackRuns.length}곳에서 한 팀이 쉬는 시간 없이 이어서 뛰어요. 이대로 만들 수는 있어요. 휴식을 늘리거나 하루 경기 수를 줄이면 줄어들 수 있어요.`
                  : '한 팀이 쉬는 시간 없이 이어서 뛰는 경기는 없어요.'}
              </span>
            </p>
          </div>
        ) : null}
      </div>
      {!busy && data !== undefined ? (
        <>
          <ol className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card-surface)]">
            {data.days.map((day) => (
              <li key={day.day} className="border-t border-[var(--border)] first:border-t-0">
                <p className="bg-[var(--surface-soft)] px-3 py-2 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)]">
                  {`${day.day}일째 · ${day.startTime}${day.endTime === null ? '' : `~${day.endTime}`} · ${day.games.length}경기`}
                </p>
                <ul>
                  {day.games.map((game) => (
                    <li key={game.order} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] px-3 py-2 text-[length:var(--font-size-caption)]">
                      <span className="w-[84px] shrink-0 tabular-nums text-[var(--text-muted)]">
                        {game.endTime === null ? game.startTime : `${game.startTime}~${game.endTime}`}
                      </span>
                      <span className="text-[var(--text-strong)]">{`${seat(game.homePosition)} 대 ${seat(game.awayPosition)}`}</span>
                      {game.backToBack.map((entry) => (
                        <span key={entry.position} className="tm-on-tint inline-flex items-center gap-1 rounded-full bg-[var(--tint-orange)] px-2 py-0.5 text-[length:var(--font-size-micro)] font-medium text-[var(--orange700)]">
                          {`${seat(entry.position)} ${entry.games}번 연속`}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            미리보기는 서버가 실제 생성과 같은 계산으로 만든 결과예요. 날짜는 아래에서 고른 날짜가 차례로 들어가요.
          </p>
        </>
      ) : null}
    </section>
  );
}
