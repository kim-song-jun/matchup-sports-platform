'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
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
  return (
    <AppChrome
      title="팀 일정"
      activeTab="teams"
      bottomNav={false}
      backHref={`/teams/${model.teamId}`}
      floatingSlot={
        model.canManage ? (
          <Link className="tm-floating-fab tm-hide-desktop" href={model.createHref} aria-label="일정 만들기">
            <PlusIcon size={26} strokeWidth={2.3} />
          </Link>
        ) : undefined
      }
    >
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

      <div className="tm-team-list" style={{ gap: 12 }}>
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
                trailing={item.stateLabel}
                chev
              />
            ))}
          </div>
        )}
      </div>
    </AppChrome>
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
      <div className="tm-text-caption" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={`tm-badge ${value === option.value ? 'tm-badge-blue' : 'tm-badge-grey'}`}
            style={{ border: 'none', cursor: 'pointer' }}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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
              <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--blue500)', marginTop: 2 }} />
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
  if (model.error) {
    return (
      <AppChrome title="일정 상세" activeTab="teams" bottomNav={false} backHref={model.backHref}>
        <ErrorState message="일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={model.onRetry} />
      </AppChrome>
    );
  }

  if (model.loading) {
    return (
      <AppChrome title="일정 상세" activeTab="teams" bottomNav={false} backHref={model.backHref}>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  const { attendance, guestRecruitment, manage } = model;

  return (
    <AppChrome title="일정 상세" activeTab="teams" bottomNav={false} backHref={model.backHref}>
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={model.backHref} aria-label="일정 목록으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </Link>
        <h1 className="tm-text-heading">{model.title}</h1>
      </div>

      <div className="tm-team-detail-section">
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
            <span className={`tm-badge ${model.state === 'SCHEDULED' ? 'tm-badge-blue' : 'tm-badge-grey'}`}>{model.stateLabel}</span>
            <span className="tm-badge tm-badge-grey">{model.visibilityLabel}</span>
          </div>
          <div className="tm-text-body-lg" style={{ marginBottom: 4 }}>{model.title}</div>
          <div className="tm-text-body" style={{ color: 'var(--text-muted)' }}>{model.dateTimeLabel}</div>
          {model.capacityLabel ? <div className="tm-text-caption" style={{ marginTop: 6 }}>{model.capacityLabel}</div> : null}
        </Card>

        {model.history.length > 0 ? (
          <Card pad={16} style={{ marginTop: 12 }}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>변경 이력</div>
            {model.history.map((entry, index) => (
              <div key={`${entry.label}-${index}`} className="tm-text-caption" style={{ marginBottom: 4 }}>
                {entry.label}{entry.detail ? ` · ${entry.detail}` : ''}
              </div>
            ))}
          </Card>
        ) : null}

        {attendance.visible ? (
          <Card pad={16} style={{ marginTop: 12 }}>
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
              <div className="tm-text-caption" style={{ marginTop: 4, color: attendance.deadlinePassed ? 'var(--red500)' : undefined }}>
                {attendance.deadlineLabel}
              </div>
            ) : null}
            {attendance.disabledReason ? (
              <div className="tm-text-caption" style={{ marginTop: 4 }} role="status">{attendance.disabledReason}</div>
            ) : null}
            {attendance.error ? <div style={{ marginTop: 8 }}><AlertBanner tone="error" message={attendance.error} /></div> : null}
          </Card>
        ) : null}

        <GuestRecruitmentCard model={guestRecruitment} />

        {manage.visible ? (
          <Card pad={16} style={{ marginTop: 12 }}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>운영 관리</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={manage.editHref}>일정 수정</Link>
              {manage.canComplete ? (
                <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" disabled={manage.completePending} onClick={manage.onComplete}>
                  {manage.completePending ? '처리 중…' : '완료 처리'}
                </button>
              ) : null}
              <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" disabled={manage.cancelPending} onClick={manage.onCancel}>
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
          </Card>
        ) : null}

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
    </AppChrome>
  );
}

function GuestRecruitmentCard({ model }: { model: ScheduleDetailViewModel['guestRecruitment'] }) {
  if (!model.visible && !model.manage) return null;

  return (
    <Card pad={16} style={{ marginTop: 12 }}>
      <div className="tm-text-label" style={{ marginBottom: 8 }}>용병 모집</div>
      {model.visible ? (
        <>
          <div className="tm-text-body">
            {model.applicantCount}/{model.slots}명 신청 · 승인 {model.approvedCount}명 · {model.stateLabel}
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
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle, #eee)', paddingTop: 12 }}>
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
          {model.manage.editPanel.error ? <div style={{ marginTop: 6 }}><AlertBanner tone="error" message={model.manage.editPanel.error} /></div> : null}
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

      {model.applicationForm ? (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle, #eee)', paddingTop: 12 }}>
          {/* successMessage는 visible(=아직 미신청) 게이트 밖에 둔다 — 신청 성공 직후
              visible이 false로 바뀌어도 "신청했어요" 확인 메시지는 계속 보여야 한다. */}
          {model.applicationForm.successMessage ? (
            <div style={{ marginBottom: 8 }}>
              <AlertBanner tone="info" message={model.applicationForm.successMessage} />
            </div>
          ) : null}
          {model.applicationForm.visible ? (
            <>
              <div className="tm-text-caption" style={{ marginBottom: 6 }}>용병으로 신청하기</div>
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
                <div style={{ marginTop: 6 }}><AlertBanner tone="error" message={model.applicationForm.error} /></div>
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
    </Card>
  );
}

// ── 생성/수정 폼 ───────────────────────────────────────────────────────────────

export function ScheduleFormPageView({ model }: { model: ScheduleFormViewModel }) {
  const title = model.mode === 'edit' ? '일정 수정' : '일정 만들기';

  if (model.forbidden) {
    return (
      <AppChrome title={title} activeTab="teams" bottomNav={false} backHref={model.backHref}>
        <EmptyState title="일정을 관리할 권한이 없어요" sub="팀장 또는 운영진만 일정을 만들거나 수정할 수 있어요." />
      </AppChrome>
    );
  }

  if (model.loadError) {
    return (
      <AppChrome title={title} activeTab="teams" bottomNav={false} backHref={model.backHref}>
        <ErrorState message="일정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={model.onRetry} />
      </AppChrome>
    );
  }

  if (model.loading) {
    return (
      <AppChrome title={title} activeTab="teams" bottomNav={false} backHref={model.backHref}>
        <PageSkeleton variant="detail" />
      </AppChrome>
    );
  }

  const { draft } = model;

  return (
    <AppChrome title={title} activeTab="teams" bottomNav={false} backHref={model.backHref}>
      <div className="tm-team-detail-section" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField
          label="제목"
          value={draft.title}
          onChange={(e) => model.onFieldChange('title', e.target.value)}
          maxLength={120}
        />

        <div>
          <div className="tm-text-label" style={{ marginBottom: 6 }}>종류</div>
          {model.typeEditable ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {model.typeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.type === option.value}
                  className={`tm-badge ${draft.type === option.value ? 'tm-badge-blue' : 'tm-badge-grey'}`}
                  style={{ border: 'none', cursor: 'pointer' }}
                  onClick={() => model.onFieldChange('type', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="tm-text-body">
              {scheduleTypeLabel(draft.type)}
              <span className="tm-text-caption" style={{ marginLeft: 6 }}>(종류는 만든 뒤 바꿀 수 없어요)</span>
            </div>
          )}
        </div>

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
          value={draft.capacity}
          onChange={(e) => model.onFieldChange('capacity', e.target.value)}
        />
        <TextField
          label="RSVP 마감"
          optional
          type="datetime-local"
          value={draft.rsvpDeadlineAt}
          onChange={(e) => model.onFieldChange('rsvpDeadlineAt', e.target.value)}
        />

        <div>
          <div className="tm-text-label" style={{ marginBottom: 6 }}>공개 범위</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {model.visibilityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={draft.visibility === option.value}
                className={`tm-badge ${draft.visibility === option.value ? 'tm-badge-blue' : 'tm-badge-grey'}`}
                style={{ border: 'none', cursor: 'pointer' }}
                onClick={() => model.onFieldChange('visibility', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

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
    </AppChrome>
  );
}

// ── 내 일정 (GET /me/schedule) ────────────────────────────────────────────────

export function MySchedulePageView({ model }: { model: MyScheduleViewModel }) {
  return (
    <AppChrome title="내 일정" activeTab="my" bottomNav={false} backHref="/my">
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
                trailing={item.stateLabel}
                chev
              />
            ))}
          </div>
        )}
      </div>
    </AppChrome>
  );
}
