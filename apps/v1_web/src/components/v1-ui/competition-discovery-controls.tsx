'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BottomSheet } from './bottom-sheet';
import { FilterIcon } from './icons';
import {
  COMPETITION_SORTS,
  competitionDiscoveryHref,
  discoveryRangeError,
  type CompetitionDiscoveryFilters,
  type CompetitionSort,
} from '@/lib/competition-discovery';
import styles from './competition-discovery-controls.module.css';

type Sport = { id: string; label: string };
type Props = {
  filters: CompetitionDiscoveryFilters;
  sports: Sport[];
  sheetOpen: boolean;
  desktop: boolean;
  total?: number;
  page?: number;
  pending: boolean;
};
const PHASE_LABELS = { upcoming: '시작 전·준비 중', ongoing: '진행 중', completed: '종료' };
const GENDER_LABELS = { male: '남성부', female: '여성부', mixed: '혼성', unspecified: '미지정' };
const FORMAT_LABELS = { league: '리그 방식', knockout: '토너먼트', group_knockout: '조별+결선' };

function FilterChoices({ title, value, options, onChange }: {
  title: string;
  value: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}) {
  return <fieldset className={styles.group}>
    <legend className="tm-text-label">{title}</legend>
    <div className="tm-filter-chip-wrap">
      {[{ value: '', label: '전체' }, ...options].map((option) => <button
        key={option.value} type="button" className={`tm-chip ${value === (option.value || undefined) ? 'tm-chip-active' : ''}`}
        aria-pressed={value === (option.value || undefined)} onClick={() => onChange(option.value || undefined)}
      >{option.label}</button>)}
    </div>
  </fieldset>;
}

/** 틀린 칸 바로 밑에 띄우고, 시트 아래 버튼에 가려지지 않게 보이는 자리로 스크롤한다. */
function RangeError({ message }: { message: string }) {
  return <p role="alert" className="tm-create-field-error" ref={(node) => { node?.scrollIntoView?.({ block: 'nearest' }); }}>{message}</p>;
}

function DiscoveryFilterSheet({ filters, sports, page }: { filters: CompetitionDiscoveryFilters; sports: Sport[]; page?: number }) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState<ReturnType<typeof discoveryRangeError>>(null);
  const router = useRouter();
  const id = useId();
  function set<K extends keyof CompetitionDiscoveryFilters>(key: K, value: CompetitionDiscoveryFilters[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setError(null);
  }
  const tournament = filters.kind === 'tournament';
  const phaseLabel = filters.kind === 'league' ? '준비 중' : tournament ? '시작 전' : '시작 전·준비 중';
  return <BottomSheet open ariaLabel="대회·리그 필터" closeHref={competitionDiscoveryHref(filters, { page })}>
    <div className="tm-filter-sheet-handle" />
    <form onSubmit={(event) => {
      event.preventDefault();
      const rangeError = discoveryRangeError(draft);
      if (rangeError) { setError(rangeError); return; }
      router.replace(competitionDiscoveryHref(draft), { scroll: false });
    }}>
      <div className="tm-filter-sheet-head">
        <div><div className="tm-text-subhead">필터</div><p className="tm-text-caption">조건을 고른 뒤 결과 보기를 눌러 주세요.</p></div>
        <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" onClick={() => {
          setDraft({ kind: filters.kind, sort: filters.sort === 'deadline' ? 'latest' : filters.sort }); setError(null);
        }}>초기화</button>
      </div>
      <div className={styles.sections}>
        <FilterChoices title="모집 상태" value={draft.registration} options={[
          { value: 'open', label: '신청 접수 중' },
          { value: 'closed', label: filters.kind === 'league' ? '접수 안 함' : '모집 종료' },
        ]} onChange={(value) => setDraft((previous) => ({ ...previous, registration: value as typeof draft.registration,
          sort: previous.sort === 'deadline' && value !== 'open' ? 'latest' : previous.sort }))} />
        <FilterChoices title="진행 상태" value={draft.phase} options={[
          { value: 'upcoming', label: phaseLabel }, { value: 'ongoing', label: '진행 중' }, { value: 'completed', label: '종료' },
        ]} onChange={(value) => set('phase', value as typeof draft.phase)} />
        <FilterChoices title="종목" value={draft.sportId} options={sports.map((sport) => ({ value: sport.id, label: sport.label }))} onChange={(value) => set('sportId', value)} />
        {tournament && <FilterChoices title="성별 부문" value={draft.genderCategory} options={Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }))} onChange={(value) => set('genderCategory', value as typeof draft.genderCategory)} />}
        <fieldset className={styles.group}>
          <legend className="tm-text-label">{filters.kind === 'league' ? '시즌 기간' : tournament ? '개최 기간' : '개최·시즌 기간'}</legend>
          <p className="tm-text-caption">선택한 기간과 겹치는 일정을 찾아요. 날짜 미정은 제외해요.</p>
          <div className={styles.range}>
            <label htmlFor={`${id}-from`}>시작 날짜<input id={`${id}-from`} type="date" value={draft.dateFrom ?? ''} onChange={(event) => set('dateFrom', event.target.value || undefined)} /></label>
            <label htmlFor={`${id}-to`}>종료 날짜<input id={`${id}-to`} type="date" value={draft.dateTo ?? ''} onChange={(event) => set('dateTo', event.target.value || undefined)} /></label>
          </div>
          {error?.field === 'date' && <RangeError message={error.message} />}
        </fieldset>
        {tournament && <>
          <FilterChoices title="경기 방식" value={draft.format} options={Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value, label }))} onChange={(value) => set('format', value as typeof draft.format)} />
          <fieldset className={styles.group}>
            <legend className="tm-text-label">참가비</legend>
            <div className="tm-filter-chip-wrap">
              <button type="button" className={`tm-chip ${draft.feeMin === undefined && draft.feeMax === undefined ? 'tm-chip-active' : ''}`} aria-pressed={draft.feeMin === undefined && draft.feeMax === undefined} onClick={() => setDraft((previous) => ({ ...previous, feeMin: undefined, feeMax: undefined }))}>전체</button>
              <button type="button" className={`tm-chip ${draft.feeMax === 0 ? 'tm-chip-active' : ''}`} aria-pressed={draft.feeMax === 0} onClick={() => setDraft((previous) => ({ ...previous, feeMin: 0, feeMax: 0 }))}>무료</button>
            </div>
            <div className={styles.range}>
              <label htmlFor={`${id}-min`}>최소 금액(원)<input id={`${id}-min`} type="number" min="0" max="2147483647" step="1" inputMode="numeric" value={draft.feeMin ?? ''} onChange={(event) => set('feeMin', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
              <label htmlFor={`${id}-max`}>최대 금액(원)<input id={`${id}-max`} type="number" min="0" max="2147483647" step="1" inputMode="numeric" value={draft.feeMax ?? ''} onChange={(event) => set('feeMax', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
            </div>
            {error?.field === 'fee' && <RangeError message={error.message} />}
          </fieldset>
        </>}
        {draft.phase === 'completed' && draft.registration === 'open' && <p className="tm-text-caption">종료된 항목은 신청을 받지 않아 결과가 없어요. 진행 상태나 모집 상태를 바꿔 주세요.</p>}
      </div>
      <div className={`tm-filter-actions ${styles.actions}`}>
        <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={competitionDiscoveryHref(filters, { page })}>닫기</Link>
        <button className="tm-btn tm-btn-lg tm-btn-primary" type="submit">결과 보기</button>
      </div>
    </form>
  </BottomSheet>;
}

export function CompetitionDiscoveryControls({ filters, sports, sheetOpen, desktop, total, pending, page }: Props) {
  const [sortOpen, setSortOpen] = useState(false);
  const router = useRouter();
  const sort = filters.sort ?? 'latest';
  const reset = { kind: filters.kind, sort: sort === 'deadline' ? 'latest' as const : sort };
  const count = [filters.phase !== undefined, filters.registration !== undefined, filters.sportId !== undefined,
    filters.genderCategory !== undefined, filters.format !== undefined, Boolean(filters.dateFrom || filters.dateTo),
    filters.feeMin !== undefined || filters.feeMax !== undefined].filter(Boolean).length;
  const summary = [filters.registration === 'open' ? '신청 접수 중' : filters.registration === 'closed' ? (filters.kind === 'league' ? '접수 안 함' : '모집 종료') : null,
    filters.phase ? (filters.phase === 'upcoming' ? (filters.kind === 'tournament' ? '시작 전' : filters.kind === 'league' ? '준비 중' : PHASE_LABELS.upcoming) : PHASE_LABELS[filters.phase]) : null,
    sports.find((sport) => sport.id === filters.sportId)?.label,
    filters.genderCategory ? GENDER_LABELS[filters.genderCategory] : null,
    filters.dateFrom || filters.dateTo ? `${filters.dateFrom ?? '전체'} ~ ${filters.dateTo ?? '전체'}` : null,
    filters.format ? FORMAT_LABELS[filters.format] : null,
    filters.feeMin !== undefined || filters.feeMax !== undefined ? (filters.feeMax === 0 ? '무료' : filters.feeMax === undefined ? `${(filters.feeMin ?? 0).toLocaleString()}원 이상` : `${filters.feeMin?.toLocaleString() ?? '0'} ~ ${filters.feeMax.toLocaleString()}원`) : null,
  ].filter(Boolean).join(' · ');
  const navigateSort = (value: CompetitionSort) => {
    router.replace(competitionDiscoveryHref({ ...filters, sort: value, ...(value === 'deadline' ? { registration: 'open' } : {}) }), { scroll: false });
    setSortOpen(false);
  };
  const filterLink = <Link className={`tm-btn tm-btn-sm tm-btn-neutral ${desktop ? '' : styles.mobileFilter}`}
    aria-label={`필터 열기 — 현재 ${summary || '전체'}`} href={competitionDiscoveryHref(filters, { filter: true, page })} scroll={false}>
    <FilterIcon size={18} aria-hidden="true" />필터{count > 0 && <> <span className={styles.filterCount}>{count}</span></>}
  </Link>;
  return <>
    {desktop && <>
      <div className={styles.toolbar}>
        <Link className={`tm-chip ${filters.registration === 'open' ? 'tm-chip-active' : ''}`} aria-current={filters.registration === 'open' ? 'true' : undefined}
          href={competitionDiscoveryHref({ ...filters, registration: filters.registration === 'open' ? undefined : 'open',
            sort: filters.registration === 'open' && sort === 'deadline' ? 'latest' : filters.sort })} scroll={false}>신청 접수 중만</Link>
        {filterLink}
      </div>
      {summary && <div className={styles.summary}><span>{summary}</span><Link href={competitionDiscoveryHref(reset)} scroll={false}>초기화</Link></div>}
    </>}
    <div className={desktop ? styles.resultbar : styles.mobileResultbar}
      role={desktop ? undefined : 'group'} aria-label={desktop ? undefined : '대회 목록 필터 및 정렬'}>
      <span className={`tm-text-caption ${desktop ? '' : styles.mobileCount}`} aria-live="polite">{pending ? '불러오는 중…' : total === undefined ? '' : `총 ${total.toLocaleString()}개`}</span>
      {desktop ? <label className={styles.sort}>정렬<select aria-label="대회·리그 정렬" value={sort} onChange={(event) => navigateSort(event.target.value as CompetitionSort)}>
        {COMPETITION_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label> : <div className={styles.mobileActions}>
        {filterLink}
        <button type="button" className={`tm-btn tm-btn-sm tm-btn-ghost ${styles.mobileSort}`} aria-haspopup="dialog" onClick={() => setSortOpen(true)}>
          {COMPETITION_SORTS.find((option) => option.value === sort)?.label}<ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>}
    </div>
    {desktop && sort === 'deadline' && <p className="tm-text-caption">신청 접수 중인 항목을 마감 가까운 순으로 봐요. 마감 미정은 뒤에 표시해요.</p>}
    {sheetOpen && <DiscoveryFilterSheet key={competitionDiscoveryHref(filters)} filters={filters} sports={sports} page={page} />}
    {sortOpen && !desktop && <BottomSheet open title="정렬" onClose={() => setSortOpen(false)}>
      <div className={styles.sortOptions}><p className="tm-text-caption">마감 가까운 순은 신청 접수 중인 항목만 보여줘요.</p>{COMPETITION_SORTS.map((option) => <button key={option.value} type="button" className={`tm-btn tm-btn-lg ${sort === option.value ? 'tm-btn-primary' : 'tm-btn-neutral'}`} aria-pressed={sort === option.value} onClick={() => navigateSort(option.value)}>{option.label}</button>)}</div>
    </BottomSheet>}
  </>;
}
