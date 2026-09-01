'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { AlertBanner, Card, EmptyState, ErrorState, ListItem, TextField } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, PlusIcon } from '@/components/v1-ui/icons';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { scheduleTypeLabel, weekdayHeaders } from './team-schedules.view-model';
import type {
  MyScheduleViewModel,
  ScheduleDetailViewModel,
  ScheduleFormViewModel,
  ScheduleListViewModel,
} from './team-schedules.types';

// ── 목록 (calendar/list 토글 + type/state 필터) ───────────────────────────────

export function ScheduleListPageView({ model }: { model: ScheduleListViewModel }) {
  const router = useRouter();
  // floatingSlot(일정 만들기 FAB)은 model.canManage(팀 상세 fetch 의존) 런타임 값이라
  // 정적 테이블(fragments/team-schedules.ts)에 못 넣는다 — 렌더 최상단에서 override로
  // 직접 밀어넣는다(app-shell-promotion.md §1.6, Hooks 규칙 — 조건부 return보다 위).
  useShellOverride({
    floatingSlot: model.canManage ? (
      <Link className="tm-floating-fab tm-hide-desktop" href={model.createHref} aria-label="일정 만들기">
        <PlusIcon size={26} strokeWidth={2.3} />
      </Link>
    ) : undefined,
  });
  return (
    <>
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={`/teams/${model.teamId}`} aria-label="팀으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </Link>
        <h1 className="tm-text-heading">{model.teamName} · 일정</h1>
        {model.canManage ? (
          <Link className="tm-btn tm-btn-sm tm-btn-primary" href={model.createHref} style={{ marginLeft: 'auto' }}>
            일정 만들기
          </Link>
        ) : null}
      </div>

      {/* .tm-team-list 는 padding만 정의된 block 컨테이너라 gap이 무시됐다 —
          flex column으로 만들어 토글/필터/목록 사이 12px 간격이 실제로 적용되게 한다. */}
      <div className="tm-team-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div role="tablist" aria-label="보기 방식" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            role="tab"
            aria-selected={model.view === 'list'}
            className={`tm-btn tm-btn-sm ${model.view === 'list' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => model.onViewChange('list')}
          >
            목록
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={model.view === 'calendar'}
            className={`tm-btn tm-btn-sm ${model.view === 'calendar' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
            onClick={() => model.onViewChange('calendar')}
          >
            캘린더
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <FilterChipGroup
            label="종류"
            options={model.typeOptions}
            value={model.typeFilter}
            onChange={model.onTypeFilterChange}
          />
          <FilterChipGroup
            label="상태"
            options={model.stateOptions}
            value={model.stateFilter}
            onChange={model.onStateFilterChange}
          />
        </div>

        {model.view === 'calendar' ? (
          <ScheduleCalendarGrid model={model} />
        ) : null}

        {model.error ? (
          <ErrorState message="일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={model.onRetry} />
        ) : model.loading ? (
          <PageSkeleton variant="list" />
        ) : model.visibleItems.length === 0 ? (
          <EmptyState
            title={model.emptyTitle}
            sub={model.emptySub}
            cta={model.canManage ? '일정 만들기' : undefined}
            onCta={model.canManage ? () => router.push(model.createHref) : undefined}
          />
        ) : (
          <div className="tm-team-open-match-list">
            {model.visibleItems.map((item) => (
              <ListItem
                key={item.id}
                href={item.href}
                title={item.title}
                sub={`${item.typeLabel} · ${item.dateTimeLabel} · ${item.attendanceSummary}`}
                // 컬러만으로 상태를 구분하지 않도록 텍스트(stateLabel)를 유지한 채 배지로 감싼다 —
                // 상세 페이지(line 257 부근)와 동일하게 stateTone(색 계산은 이미 view-model에 있었음)을 소비.
                trailing={
                  <span className={`tm-badge ${item.stateTone === 'default' ? 'tm-badge-blue' : 'tm-badge-grey'}`}>
                    {item.stateLabel}
                  </span>
                }
                chev
                // 매치 ↔ 팀일정 연동: 가확정(상대팀 미확정) MATCH 카드는 반투명 처리 — 캘린더
                // 그리드의 "이번 달이 아닌 날"과 같은 opacity 값을 재사용한다(위 191행 부근).
                // 색만으로 정보를 전달하지 않도록 위 trailing 배지 텍스트가 항상 함께 있다.
                style={item.isTentative ? { opacity: 0.35 } : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FilterChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="tm-text-caption" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={`tm-chip ${value === option.value ? 'tm-chip-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScheduleCalendarGrid({ model }: { model: ScheduleListViewModel }) {
  const { calendar } = model;
  return (
    <Card pad={12}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" aria-label="이전 달" onClick={model.onPrevMonth}>
          이전
        </button>
        <div className="tm-text-label">{calendar.monthLabel}</div>
        <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" aria-label="다음 달" onClick={model.onNextMonth}>
          다음
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {weekdayHeaders().map((day) => (
          <div key={day} className="tm-text-micro" style={{ textAlign: 'center', color: 'var(--text-caption)' }}>
            {day}
          </div>
        ))}
        {calendar.weeks.flat().map((day) => (
          <button
            key={day.dateKey}
            type="button"
            aria-pressed={model.selectedDateKey === day.dateKey}
            aria-label={`${day.dayNumber}일${day.scheduleCount > 0 ? `, 일정 ${day.scheduleCount}건` : ''}`}
            onClick={() => model.onSelectDate(model.selectedDateKey === day.dateKey ? null : day.dateKey)}
            style={{
              minHeight: 44,
              minWidth: 44,
              borderRadius: 10,
              border: model.selectedDateKey === day.dateKey ? '2px solid var(--blue500)' : '1px solid transparent',
              background: day.isToday ? 'var(--blue50)' : 'transparent',
              opacity: day.inCurrentMonth ? 1 : 0.35,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-strong)',
            }}
          >
            <span className="tm-text-caption">{day.dayNumber}</span>
            {day.scheduleCount > 0 ? (
              <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 'var(--radius-pill)', background: 'var(--blue500)', marginTop: 2 }} />
            ) : null}
          </button>
        ))}
      </div>
      {model.selectedDateKey ? (
        <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" style={{ marginTop: 8 }} onClick={() => model.onSelectDate(null)}>
          날짜 필터 해제
        </button>
      ) : null}
    </Card>
  );
}

// ── 상세 ──────────────────────────────────────────────────────────────────────

export function ScheduleDetailPageView({ model }: { model: ScheduleDetailViewModel }) {
  // loading/error 상태에선 테이블 기본값(desktopHead:true)을 쓰고, success 분기만 자기
  // `.tm-desktop-page-head`를 직접 그려 제너릭 데스크톱 헤더를 꺼야 한다(§1.9 표 R3).
  // Hooks 규칙 때문에 이 호출 자체는 조건부 return보다 위, 매 렌더 항상 실행한다 — 값만
  // success 여부로 갈린다(undefined면 테이블 기본값이 그대로 살아남는다).
  useShellOverride({ desktopHead: !model.error && !model.loading ? false : undefined });

  if (model.error) {
    return <ErrorState message="일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={model.onRetry} />;
  }

  if (model.loading) {
    return <PageSkeleton variant="detail" />;
  }

  const { attendance, guestRecruitment, manage } = model;

  return (
    <>
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={model.backHref} aria-label="일정 목록으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </Link>
        <h1 className="tm-text-heading">{model.title}</h1>
      </div>

      <div className="tm-team-detail-section" style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {model.conflictBanner ? (
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <AlertBanner tone="warning" message={model.conflictBanner} />
            </div>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-ghost"
              aria-label="알림 닫기"
              onClick={model.onDismissConflict}
            >
              닫기
            </button>
          </div>
        ) : null}

        <Card pad={16}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span className="tm-badge tm-badge-blue">{model.typeLabel}</span>
            <span className={`tm-badge ${model.stateTone === 'default' ? 'tm-badge-blue' : 'tm-badge-grey'}`}>{model.stateLabel}</span>
            <span className="tm-badge tm-badge-grey">{model.visibilityLabel}</span>
          </div>
          <div className="tm-text-body-lg" style={{ marginBottom: 4 }}>{model.title}</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>{model.dateTimeLabel}</div>
          {model.capacityLabel ? <div className="tm-text-caption" style={{ marginTop: 8 }}>{model.capacityLabel}</div> : null}
        </Card>

        {/* 변경 이력·내 참석·용병 모집·운영 관리를 카드마다 따로 감싸면 화면이 상자
            더미로 보인다(DESIGN.md: 카드 구분은 배경색 대비로, 카드마다 개별 보더 금지).
            팀/유저 공개 기록 화면(team-records-content.tsx)이 이미 쓰는 "카드 하나 +
            내부 구분선" 관례를 그대로 따른다. */}
        {(() => {
          const sections = [
            model.history.length > 0 ? (
              <div key="history">
                <div className="tm-text-label" style={{ marginBottom: 8 }}>변경 이력</div>
                {model.history.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="tm-text-caption" style={{ marginBottom: 4 }}>
                    {entry.label}{entry.detail ? ` · ${entry.detail}` : ''}
                  </div>
                ))}
              </div>
            ) : null,
            attendance.visible ? (
              <div key="attendance">
                <div className="tm-text-label" style={{ marginBottom: 8 }}>내 참석</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {(['GOING', 'MAYBE', 'NOT_GOING'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={attendance.myStatus === status}
                      disabled={attendance.disabled || attendance.pending}
                      className={`tm-btn tm-btn-sm ${attendance.myStatus === status ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
                      style={{ minHeight: 44 }}
                      onClick={() => attendance.onSetStatus(status)}
                    >
                      {status === 'GOING' ? '참석' : status === 'MAYBE' ? '미정' : '불참'}
                    </button>
                  ))}
                </div>
                {attendance.myStatus === 'WAITLISTED' ? (
                  <div className="tm-text-caption" role="status">대기 {attendance.waitlistPosition}번째예요.</div>
                ) : null}
                <div className="tm-text-caption" style={{ marginTop: 4 }}>
                  참석 {attendance.counts.going}명
                  {attendance.counts.waitlisted > 0 ? ` · 대기 ${attendance.counts.waitlisted}명` : ''}
                </div>
                {attendance.deadlineLabel ? (
                  <div className="tm-text-caption" style={{ marginTop: 4, color: attendance.deadlinePassed ? 'var(--red700)' : undefined }}>
                    {attendance.deadlineLabel}
                  </div>
                ) : null}
                {attendance.disabledReason ? (
                  <div className="tm-text-caption" style={{ marginTop: 4 }} role="status">{attendance.disabledReason}</div>
                ) : null}
                {attendance.error ? <div style={{ marginTop: 8 }}><AlertBanner tone="error" message={attendance.error} /></div> : null}
              </div>
            ) : null,
            model.attendees.visible ? <ScheduleAttendeeSection key="attendees" model={model.attendees} /> : null,
            guestRecruitment.visible || guestRecruitment.manage ? (
              <GuestRecruitmentSection key="guest" model={guestRecruitment} />
            ) : null,
            manage.visible ? (
              <div key="manage">
                <div className="tm-text-label" style={{ marginBottom: 8 }}>운영 관리</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={manage.editHref}>일정 수정</Link>
                  {/* 완료 처리는 항상 렌더한다 — canComplete가 false여도 버튼을 감추지 않고
                      disabled + 사유로 보여준다("버튼이 왜 안 되는지 항상 설명"). */}
                  <button
                    type="button"
                    className="tm-btn tm-btn-sm tm-btn-neutral"
                    disabled={!manage.canComplete || manage.completePending}
                    aria-describedby={!manage.canComplete && manage.completeDisabledReason ? 'schedule-complete-disabled-reason' : undefined}
                    onClick={manage.onComplete}
                  >
                    {manage.completePending ? '처리 중…' : '완료 처리'}
                  </button>
                  {/* 취소는 이 카드에서 유일한 파괴적 액션인데 ghost(배경 없음)라 평문처럼 보여
                      형제 버튼들보다 오히려 덜 눌러 보였다. 테두리를 줘 버튼임이 드러나게 하되,
                      꽉 찬 danger 로 만들면 수정·완료 처리보다 시선을 끌어 잘못 유도하므로
                      outline 에 위험 색만 얹는다. */}
                  <button
                    type="button"
                    className="tm-btn tm-btn-sm tm-btn-outline"
                    style={{ color: 'var(--red700)' }}
                    disabled={manage.cancelPending}
                    onClick={manage.onCancel}
                  >
                    일정 취소
                  </button>
                  {manage.reminders.filter((reminder) => reminder.visible).map((reminder) => (
                    <button
                      key={reminder.kind}
                      type="button"
                      className="tm-btn tm-btn-sm tm-btn-neutral"
                      disabled={reminder.pending}
                      onClick={reminder.onTrigger}
                    >
                      {reminder.pending ? '전송 중…' : reminder.label}
                    </button>
                  ))}
                </div>
                {!manage.canComplete && manage.completeDisabledReason ? (
                  <div id="schedule-complete-disabled-reason" className="tm-text-caption" style={{ marginTop: 8 }} role="status">
                    {manage.completeDisabledReason}
                  </div>
                ) : null}
              </div>
            ) : null,
          ].filter(Boolean);

          return sections.length > 0 ? (
            <Card pad={16} style={{ marginTop: 12 }}>
              {sections.map((section, index) => (
                <div key={index} style={index > 0 ? { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' } : undefined}>
                  {section}
                </div>
              ))}
            </Card>
          ) : null;
        })()}

        {model.cancelModal.open ? (
          <Card pad={16} style={{ marginTop: 12 }}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>일정을 취소할까요?</div>
            <TextField
              label="취소 사유"
              multiline
              rows={3}
              value={model.cancelModal.reason}
              onChange={(e) => model.cancelModal.onReasonChange(e.target.value)}
              disabled={model.cancelModal.pending}
              error={model.cancelModal.error}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={model.cancelModal.onDismiss} disabled={model.cancelModal.pending}>
                닫기
              </button>
              <button
                type="button"
                className="tm-btn tm-btn-sm tm-btn-danger"
                onClick={model.cancelModal.onConfirm}
                disabled={model.cancelModal.pending || model.cancelModal.reason.trim().length === 0}
              >
                {model.cancelModal.pending ? '취소하는 중…' : '취소 확정'}
              </button>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}

const ATTENDEE_STATUS_LABEL: Record<string, string> = {
  GOING: '참석',
  MAYBE: '미정',
  NOT_GOING: '불참',
  WAITLISTED: '대기',
  NO_RESPONSE: '미응답',
};

const ATTENDEE_STATUS_BADGE_CLASS: Record<string, string> = {
  GOING: 'tm-badge-green',
  MAYBE: 'tm-badge-grey',
  NOT_GOING: 'tm-badge-grey',
  WAITLISTED: 'tm-badge-blue',
  NO_RESPONSE: 'tm-badge-orange',
};

/** 원본 목업(preview.html "02 · 일정 상세와 참석 현황")의 전체/참석/미응답 탭 명단 —
 * 매니저가 "누가 오는지"를 한 명씩 보고 미응답자를 식별할 수 있어야 한다는 설계였는데,
 * 실제 구현은 그동안 goingCount 등 집계 숫자와 내 참석 여부만 보여줬다. */
function ScheduleAttendeeSection({ model }: { model: ScheduleDetailViewModel['attendees'] }) {
  const [tab, setTab] = useState<'all' | 'going' | 'no_response'>('all');
  if (!model.visible) return null;

  const filtered =
    tab === 'going'
      ? model.items.filter((item) => item.status === 'GOING')
      : tab === 'no_response'
        ? model.items.filter((item) => item.status === 'NO_RESPONSE')
        : model.items;

  return (
    <div>
      <div className="tm-text-label" style={{ marginBottom: 8 }}>참석 현황</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className={`tm-btn tm-btn-sm ${tab === 'all' ? 'tm-btn-primary' : 'tm-btn-neutral'}`} onClick={() => setTab('all')}>
          전체 {model.counts.all}
        </button>
        <button type="button" className={`tm-btn tm-btn-sm ${tab === 'going' ? 'tm-btn-primary' : 'tm-btn-neutral'}`} onClick={() => setTab('going')}>
          참석 {model.counts.going}
        </button>
        <button type="button" className={`tm-btn tm-btn-sm ${tab === 'no_response' ? 'tm-btn-primary' : 'tm-btn-neutral'}`} onClick={() => setTab('no_response')}>
          미응답 {model.counts.noResponse}
        </button>
      </div>
      {model.proxyError ? (
        <div className="tm-text-caption" role="alert" style={{ color: 'var(--red700)', marginBottom: 8 }}>
          {model.proxyError}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <div className="tm-text-caption">해당하는 팀원이 없어요.</div>
      ) : (
        // A안(사용자 확정): 데스크톱에서 이름은 왼쪽 끝, 액션은 오른쪽 끝으로 벌어져
        // 사이가 통째로 비었다(1440 실화면). 행마다 다른 구조를 만들지 않고 목록 자체의
        // 폭을 모바일 리듬에 맞춰 묶는다 -- 코드 경로가 하나로 유지된다.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 560 }}>
          {filtered.map((item) => (
            <div key={item.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
              <div
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-circle)',
                  /* [다크모드 fix] grey100 다크값(#1c1e24)이 카드 배경 --card-surface
                     다크값(#1c1e24)과 동일해 아바타 원이 안 보였다. grey150(다크 #20222a)로 분리. */
                  background: 'var(--grey150)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {item.nickname.slice(0, 1)}
              </div>
              <div className="tm-text-body" style={{ flex: 1, minWidth: 0 }}>{item.nickname}</div>
              {/*
                미응답 팀원만 대리 표시 대상이다 — 이미 응답한 사람의 의사를 팀장이
                덮어쓰지 않는다. 정원이 찼으면 서버가 본인 응답과 똑같이 대기자로
                내리므로(사용자 확정) 여기서 따로 막지 않는다.
              */}
              {model.canProxy &&
              item.status === 'NO_RESPONSE' &&
              model.viewerUserId !== null &&
              item.userId !== model.viewerUserId ? (
                <button
                  type="button"
                  className="tm-btn tm-btn-sm tm-btn-neutral"
                  style={{ minHeight: 44 }}
                  disabled={model.proxyPendingUserId !== null}
                  aria-label={`${item.nickname} 참석으로 대신 표시`}
                  onClick={() => model.onProxyGoing(item.userId)}
                >
                  {model.proxyPendingUserId === item.userId ? '처리 중…' : '참석 대신 표시'}
                </button>
              ) : null}
              <span className={`tm-badge ${ATTENDEE_STATUS_BADGE_CLASS[item.status] ?? 'tm-badge-grey'}`}>
                {ATTENDEE_STATUS_LABEL[item.status] ?? item.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GuestRecruitmentSection({ model }: { model: ScheduleDetailViewModel['guestRecruitment'] }) {
  if (!model.visible && !model.manage) return null;

  return (
    <div>
      <div className="tm-text-label" style={{ marginBottom: 8 }}>용병 모집</div>
      {model.visible ? (
        <>
          <div className="tm-text-body">
            {model.applicantCount}/{model.slots}명 신청 · 승인 {model.approvedCount}명 · {model.stateLabel}
            {model.visibilityLabel ? (
              <span className={`tm-badge ${model.visibilityLabel === '전체 공개' ? 'tm-badge-blue' : 'tm-badge-grey'}`} style={{ marginLeft: 6 }}>
                {model.visibilityLabel}
              </span>
            ) : null}
          </div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.closesAtLabel}</div>
          {model.note ? <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.note}</div> : null}
        </>
      ) : (
        <div className="tm-text-caption">아직 용병 모집이 열려 있지 않아요.</div>
      )}

      {model.manage ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {!model.manage.exists ? (
            <button type="button" className="tm-btn tm-btn-sm tm-btn-primary" disabled={model.manage.pending} onClick={model.manage.onCreate}>
              용병 모집 열기
            </button>
          ) : (
            <>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" disabled={model.manage.pending} onClick={model.manage.onEdit}>
                모집 정보 수정
              </button>
              {model.isOpen ? (
                <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" disabled={model.manage.pending} onClick={model.manage.onToggleOpen}>
                  모집 마감
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {model.manage?.editPanel?.open ? (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <TextField
            label="모집 인원"
            type="number"
            min={1}
            value={model.manage.editPanel.slots}
            onChange={(e) => model.manage?.editPanel?.onSlotsChange(e.target.value)}
            disabled={model.manage.editPanel.pending}
          />
          <TextField
            label="마감 시각"
            type="datetime-local"
            value={model.manage.editPanel.closesAt}
            onChange={(e) => model.manage?.editPanel?.onClosesAtChange(e.target.value)}
            disabled={model.manage.editPanel.pending}
          />
          <TextField
            label="안내 메모"
            optional
            multiline
            rows={2}
            value={model.manage.editPanel.note}
            onChange={(e) => model.manage?.editPanel?.onNoteChange(e.target.value)}
            disabled={model.manage.editPanel.pending}
          />
          <div style={{ marginTop: 8 }}>
            <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>공개 범위</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(
                [
                  { value: 'PUBLIC' as const, label: '전체 공개' },
                  { value: 'MEMBERS' as const, label: '팀원 전용' },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={model.manage?.editPanel?.visibility === option.value}
                  className={`tm-chip ${model.manage?.editPanel?.visibility === option.value ? 'tm-chip-active' : ''}`}
                  disabled={model.manage?.editPanel?.pending}
                  onClick={() => model.manage?.editPanel?.onVisibilityChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {model.manage.editPanel.visibility === 'MEMBERS' ? (
              <div className="tm-text-caption" style={{ marginTop: 6 }}>
                팀원 전용으로 두면 팀 밖의 사람은 이 모집을 보거나 신청할 수 없어요.
              </div>
            ) : null}
          </div>
          {model.manage.editPanel.error ? <div style={{ marginTop: 8 }}><AlertBanner tone="error" message={model.manage.editPanel.error} /></div> : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={model.manage.editPanel.onDismiss} disabled={model.manage.editPanel.pending}>
              닫기
            </button>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-primary" onClick={model.manage.editPanel.onSave} disabled={model.manage.editPanel.pending}>
              {model.manage.editPanel.pending ? '저장하는 중…' : '저장'}
            </button>
          </div>
        </div>
      ) : null}

      {model.manage?.exists ? <GuestApplicantList model={model.manage.applications} /> : null}

      {model.applicationForm ? (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {/* successMessage는 visible(=아직 미신청) 게이트 밖에 둔다 — 신청 성공 직후
              visible이 false로 바뀌어도 "신청했어요" 확인 메시지는 계속 보여야 한다. */}
          {model.applicationForm.successMessage ? (
            <div style={{ marginBottom: 8 }}>
              <AlertBanner tone="info" message={model.applicationForm.successMessage} />
            </div>
          ) : null}
          {model.applicationForm.visible ? (
            <>
              <div className="tm-text-caption" style={{ marginBottom: 8 }}>용병으로 신청하기</div>
              <TextField
                label="표시 이름"
                value={model.applicationForm.displayName}
                onChange={(e) => model.applicationForm?.onDisplayNameChange(e.target.value)}
                disabled={model.applicationForm.submitting}
              />
              <TextField
                label="메모"
                optional
                multiline
                rows={2}
                value={model.applicationForm.note}
                onChange={(e) => model.applicationForm?.onNoteChange(e.target.value)}
                disabled={model.applicationForm.submitting}
              />
              {model.applicationForm.error ? (
                <div style={{ marginTop: 8 }}><AlertBanner tone="error" message={model.applicationForm.error} /></div>
              ) : null}
              <button
                type="button"
                className="tm-btn tm-btn-sm tm-btn-primary"
                style={{ marginTop: 8 }}
                disabled={model.applicationForm.submitting || model.applicationForm.displayName.trim().length === 0}
                onClick={model.applicationForm.onSubmit}
              >
                {model.applicationForm.submitting ? '신청하는 중…' : '신청하기'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const GUEST_APPLICATION_STATE_BADGE_CLASS: Record<string, string> = {
  PENDING: 'tm-badge-orange',
  APPROVED: 'tm-badge-green',
  REJECTED: 'tm-badge-grey',
  WITHDRAWN: 'tm-badge-grey',
};

/** manager+ 전용 신청자 목록 — 승인/거절 버튼이 여기 없어서 신청이 영구 PENDING으로 남던
 * 결함(승인 API 자체가 없었음)의 화면쪽 절반. PENDING 행에만 승인/거절 버튼을 보여준다. */
function GuestApplicantList({ model }: { model: NonNullable<ScheduleDetailViewModel['guestRecruitment']['manage']>['applications'] }) {
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="tm-text-label" style={{ marginBottom: 8 }}>신청자 목록</div>
      {model.error ? <div style={{ marginBottom: 8 }}><AlertBanner tone="error" message={model.error} /></div> : null}
      {model.loading ? (
        <div className="tm-text-caption">불러오는 중…</div>
      ) : model.items.length === 0 ? (
        <div className="tm-text-caption">아직 신청자가 없어요.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {model.items.map((item) => {
            const pending = model.pendingApplicationId === item.applicationId;
            return (
              <div
                key={item.applicationId}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', flexWrap: 'wrap' }}
              >
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div className="tm-text-body">{item.displayName}</div>
                  {item.note ? <div className="tm-text-caption" style={{ marginTop: 2 }}>{item.note}</div> : null}
                </div>
                <span className={`tm-badge ${GUEST_APPLICATION_STATE_BADGE_CLASS[item.state] ?? 'tm-badge-grey'}`}>
                  {item.stateLabel}
                </span>
                {item.state === 'PENDING' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="tm-btn tm-btn-sm tm-btn-neutral"
                      disabled={pending}
                      onClick={() => model.onReject(item.applicationId)}
                      aria-label={`${item.displayName}님 신청 거절`}
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      className="tm-btn tm-btn-sm tm-btn-primary"
                      disabled={pending}
                      onClick={() => model.onApprove(item.applicationId)}
                      aria-label={`${item.displayName}님 신청 승인`}
                    >
                      {pending ? '처리 중…' : '승인'}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 생성/수정 폼 ───────────────────────────────────────────────────────────────

export function ScheduleFormPageView({ model }: { model: ScheduleFormViewModel }) {
  // title은 더 이상 여기서 쓰지 않는다 — mode('create'|'edit')는 fetch가 아니라 라우트
  // (/schedules/new vs /schedules/:scheduleId/edit)로만 정해지므로, 정적 테이블
  // (fragments/team-schedules.ts)이 라우트별로 이미 "일정 만들기"/"일정 수정"을 갖고
  // 있다 — override가 필요 없다(app-motion-wave-plan.md §2.25~2.38 공통 절차 2).
  if (model.forbidden) {
    return <EmptyState title="일정을 관리할 권한이 없어요" sub="팀장 또는 운영진만 일정을 만들거나 수정할 수 있어요." />;
  }

  if (model.loadError) {
    return <ErrorState message="일정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={model.onRetry} />;
  }

  if (model.loading) {
    return <PageSkeleton variant="detail" />;
  }

  const { draft } = model;

  return (
    <>
      {/* 필드를 나열만 하던 화면에서 "기본 정보 / 일정 / 공개 설정" 세 개의 별도 카드로
          나눴었지만, 그러면 흰 배경 위에 흰 카드가 세 번 반복돼 카드 자체가 하나의
          빈 여백 상자처럼 보인다(DESIGN.md: 카드마다 개별 보더 금지). 일정 상세 화면과
          같은 관례로 카드 하나 + 내부 구분선으로 합친다. */}
      <div style={{ padding: '16px 20px 40px' }}>
      <Card>
        <div>
          <div className="tm-text-label" style={{ marginBottom: 16, color: 'var(--text-muted)' }}>기본 정보</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextField
              label="제목"
              value={draft.title}
              onChange={(e) => model.onFieldChange('title', e.target.value)}
              maxLength={120}
              placeholder="예: 주말 정기 훈련"
            />

            <div>
              <div className="tm-text-label" style={{ marginBottom: 8 }}>종류</div>
              {model.typeEditable ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {model.typeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={draft.type === option.value}
                      className={`tm-chip ${draft.type === option.value ? 'tm-chip-active' : ''}`}
                      onClick={() => model.onFieldChange('type', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="tm-text-body">
                  {scheduleTypeLabel(draft.type)}
                  <span className="tm-text-caption" style={{ marginLeft: 8 }}>(종류는 만든 뒤 바꿀 수 없어요)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div className="tm-text-label" style={{ marginBottom: 16, color: 'var(--text-muted)' }}>일정</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextField
              label="시작 시각"
              type="datetime-local"
              value={draft.startAt}
              onChange={(e) => model.onFieldChange('startAt', e.target.value)}
            />
            <TextField
              label="종료 시각"
              type="datetime-local"
              value={draft.endAt}
              onChange={(e) => model.onFieldChange('endAt', e.target.value)}
            />
            <TextField
              label="정원"
              optional
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="예: 12"
              value={draft.capacity}
              onChange={(e) => model.onFieldChange('capacity', e.target.value)}
              action={draft.capacity ? <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>명</span> : undefined}
            />
            <TextField
              label="RSVP 마감"
              optional
              type="datetime-local"
              value={draft.rsvpDeadlineAt}
              onChange={(e) => model.onFieldChange('rsvpDeadlineAt', e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div className="tm-text-label" style={{ marginBottom: 16, color: 'var(--text-muted)' }}>공개 설정</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {model.visibilityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={draft.visibility === option.value}
                className={`tm-chip ${draft.visibility === option.value ? 'tm-chip-active' : ''}`}
                onClick={() => model.onFieldChange('visibility', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {model.error ? <AlertBanner tone="error" message={model.error} /> : null}

        <button
          type="button"
          className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
          disabled={model.submitting || draft.title.trim().length === 0}
          onClick={model.onSubmit}
        >
          {model.submitting ? '저장하는 중…' : model.mode === 'edit' ? '저장' : '일정 만들기'}
        </button>
      </div>
      </div>
    </>
  );
}

// ── 내 일정 (GET /me/schedule) ────────────────────────────────────────────────

export function MySchedulePageView({ model }: { model: MyScheduleViewModel }) {
  return (
    <div className="tm-my-shell">
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">내 일정</h1>
        </div>

        <FilterChipGroup label="상태" options={model.statusOptions} value={model.statusFilter} onChange={model.onStatusFilterChange} />

        {model.error ? (
          <ErrorState message="일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={model.onRetry} />
        ) : model.loading ? (
          <PageSkeleton variant="list" />
        ) : model.items.length === 0 ? (
          <EmptyState title={model.emptyTitle} sub={model.emptySub} />
        ) : (
          <div className="tm-my-list-stack">
            {model.items.map((item) => (
              <ListItem
                key={`${item.teamId}-${item.id}`}
                href={item.href}
                title={item.title}
                sub={`${item.teamName} · ${item.typeLabel} · ${item.dateTimeLabel}${item.myAttendanceLabel ? ` · ${item.myAttendanceLabel}` : ''}`}
                trailing={
                  <span className={`tm-badge ${item.stateTone === 'default' ? 'tm-badge-blue' : 'tm-badge-grey'}`}>
                    {item.stateLabel}
                  </span>
                }
                chev
                style={item.isTentative ? { opacity: 0.35 } : undefined}
              />
            ))}
          </div>
        )}
      </div>
  );
}
