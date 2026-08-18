'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, FilePlus2, Save, ScrollText, Send, ShieldCheck } from 'lucide-react';
import {
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import {
  useV1AdminMe,
  useV1AdminTerms,
  useV1ChangeAdminTermsStatus,
  useV1CreateAdminTermsPolicy,
  useV1CreateAdminTermsVersion,
  useV1UpdateAdminTermsDraft,
  useV1UpdateAdminTermsPolicy,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type {
  V1AdminTermsDocument,
  V1AdminTermsPlacementPayload,
  V1AdminTermsPolicy,
  V1ManagedTermsContext,
  V1ManagedTermsRequirement,
} from '@/types/api';

const contextLabel: Record<V1ManagedTermsContext, string> = {
  signup: '회원가입',
  tournament_application: '대회 신청',
  footer: '하단 메뉴',
};
const requirementLabel: Record<V1ManagedTermsRequirement, string> = {
  required: '필수',
  optional: '선택',
  display_only: '열람 전용',
};
const statusLabel = { draft: '초안', published: '발행', archived: '보관' } as const;

function requirementsForContext(context: V1ManagedTermsContext): V1ManagedTermsRequirement[] {
  return context === 'footer' ? ['display_only'] : ['required', 'optional'];
}

function nextVersion(value: string) {
  const match = /^v(\d+)\.(\d+)$/.exec(value.trim());
  return match ? `v${match[1]}.${Number(match[2]) + 1}` : '';
}

function localDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

type DocumentForm = {
  documentId: string | null;
  version: string;
  title: string;
  subtitle: string;
  content: string;
  changeSummary: string;
  effectiveAt: string;
  requiresReconsent: boolean;
  enforcementAt: string;
  status: 'draft' | 'published' | 'archived';
};

const emptyDocument: DocumentForm = {
  documentId: null,
  version: '',
  title: '',
  subtitle: '',
  content: '',
  changeSummary: '',
  effectiveAt: '',
  requiresReconsent: true,
  enforcementAt: '',
  status: 'draft',
};

function documentForm(document: V1AdminTermsDocument): DocumentForm {
  return {
    documentId: document.documentId,
    version: document.version,
    title: document.title,
    subtitle: document.subtitle ?? '',
    content: document.content,
    changeSummary: document.changeSummary ?? '',
    effectiveAt: localDate(document.effectiveAt),
    requiresReconsent: document.requiresReconsent,
    enforcementAt: localDate(document.enforcementAt),
    status: document.status,
  };
}

// 이 필드들 중 일부(437~550행)는 bg-[var(--card-surface)]인 "약관 편집" 섹션(412행) 안에
// 중첩된다 — 필드도 card-surface면 카드 안에 묻혀 경계가 안 보인다(전수검수에서 발견).
// --surface-soft 로 구분하고, disabled 는 --card-surface(더 어두움)로 바꿔 "꺼짐" 느낌을 유지한다.
const fieldClass =
  'min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--card-surface)] disabled:text-[var(--text-muted)]';

export default function AdminTermsPage() {
  const [search, setSearch] = useState('');
  const [context, setContext] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [policyActive, setPolicyActive] = useState(true);
  const [placements, setPlacements] = useState<V1AdminTermsPlacementPayload[]>([]);
  const [form, setForm] = useState<DocumentForm>(emptyDocument);
  const [newCode, setNewCode] = useState('');
  const [statusReason, setStatusReason] = useState('');

  const filters = useMemo(
    () => ({ ...(search.trim() ? { q: search.trim() } : {}), ...(context ? { context } : {}) }),
    [search, context],
  );
  const { data, isPending, isError, error, refetch } = useV1AdminTerms(filters);
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const { toasts, showToast } = useAdminToast();

  const updatePolicy = useV1UpdateAdminTermsPolicy();
  const createPolicy = useV1CreateAdminTermsPolicy();
  const createVersion = useV1CreateAdminTermsVersion();
  const updateDraft = useV1UpdateAdminTermsDraft();
  const changeStatus = useV1ChangeAdminTermsStatus();
  const saving =
    updatePolicy.isPending ||
    createPolicy.isPending ||
    createVersion.isPending ||
    updateDraft.isPending ||
    changeStatus.isPending;

  const selected =
    data?.items.find((policy) => policy.policyId === selectedPolicyId) ?? data?.items[0] ?? null;

  useEffect(() => {
    if (!selected || creatingPolicy) return;
    if (selectedPolicyId !== selected.policyId) setSelectedPolicyId(selected.policyId);
    setPolicyName(selected.name);
    setPolicyActive(selected.isActive);
    setPlacements(
      selected.placements.map(({ context: placementContext, requirement, displayOrder, isActive }) => ({
        context: placementContext,
        requirement,
        displayOrder,
        isActive,
      })),
    );
    const current =
      selected.documents.find((document) => document.documentId === selected.currentDocumentId) ??
      selected.documents[0];
    setForm(current ? documentForm(current) : emptyDocument);
    setStatusReason('');
  }, [selected?.policyId, creatingPolicy]);

  function selectPolicy(policy: V1AdminTermsPolicy) {
    setCreatingPolicy(false);
    setSelectedPolicyId(policy.policyId);
    setPolicyName(policy.name);
    setPolicyActive(policy.isActive);
    setPlacements(
      policy.placements.map(({ context: placementContext, requirement, displayOrder, isActive }) => ({
        context: placementContext,
        requirement,
        displayOrder,
        isActive,
      })),
    );
    const current =
      policy.documents.find((document) => document.documentId === policy.currentDocumentId) ??
      policy.documents[0];
    setForm(current ? documentForm(current) : emptyDocument);
  }

  function beginCreatePolicy() {
    setCreatingPolicy(true);
    setSelectedPolicyId('');
    setNewCode('');
    setPolicyName('');
    setPolicyActive(true);
    setPlacements([{ context: 'signup', requirement: 'required', displayOrder: 0, isActive: true }]);
    setForm({ ...emptyDocument, version: 'v1.1' });
    setStatusReason('');
  }

  function beginNewVersion() {
    if (!selected) return;
    const source =
      selected.documents.find((document) => document.documentId === selected.currentDocumentId) ??
      selected.documents[0];
    setForm({
      documentId: null,
      version: nextVersion(source?.version ?? ''),
      title: source?.title ?? selected.name,
      subtitle: source?.subtitle ?? '',
      content: source?.content ?? '',
      changeSummary: '',
      effectiveAt: '',
      requiresReconsent: true,
      enforcementAt: '',
      status: 'draft',
    });
    setStatusReason('');
  }

  function setPlacement(index: number, patch: Partial<V1AdminTermsPlacementPayload>) {
    setPlacements((current) =>
      current.map((placement, placementIndex) =>
        placementIndex === index ? { ...placement, ...patch } : placement,
      ),
    );
  }

  function setPlacementContext(index: number, placementContext: V1ManagedTermsContext) {
    setPlacement(index, {
      context: placementContext,
      requirement: placementContext === 'footer' ? 'display_only' : 'required',
    });
  }

  function savePolicySettings() {
    if (!selected || !policyName.trim() || placements.length === 0) return;
    updatePolicy.mutate(
      {
        policyId: selected.policyId,
        body: { name: policyName.trim(), isActive: policyActive, placements },
      },
      {
        onSuccess: () => showToast('약관 노출 설정을 저장했어요.', 'success'),
        onError: (mutationError) =>
          showToast(extractErrorMessage(mutationError, '약관 설정 저장에 실패했어요.'), 'error'),
      },
    );
  }

  function submitDocument(event: FormEvent) {
    event.preventDefault();
    if (!form.version.trim() || !form.title.trim() || !form.content.trim()) {
      showToast('버전, 제목, 본문을 모두 입력해 주세요.', 'error');
      return;
    }
    const body = {
      version: form.version.trim(),
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      content: form.content,
      changeSummary: form.changeSummary.trim() || undefined,
      effectiveAt: form.effectiveAt ? new Date(form.effectiveAt).toISOString() : null,
      requiresReconsent: form.requiresReconsent,
      enforcementAt: form.enforcementAt ? new Date(form.enforcementAt).toISOString() : null,
    };
    if (creatingPolicy) {
      if (!newCode.trim() || !policyName.trim()) {
        showToast('정책 코드와 관리 이름을 입력해 주세요.', 'error');
        return;
      }
      createPolicy.mutate(
        { ...body, code: newCode.trim(), name: policyName.trim(), placements },
        {
          onSuccess: (policy) => {
            setCreatingPolicy(false);
            setSelectedPolicyId(policy.policyId);
            showToast('새 약관 정책과 첫 초안을 만들었어요.', 'success');
          },
          onError: (mutationError) =>
            showToast(extractErrorMessage(mutationError, '새 약관 생성에 실패했어요.'), 'error'),
        },
      );
      return;
    }
    if (!selected) return;
    const mutation = form.documentId ? updateDraft : createVersion;
    const variables = form.documentId
      ? { policyId: selected.policyId, documentId: form.documentId, body }
      : { policyId: selected.policyId, body };
    mutation.mutate(variables as never, {
      onSuccess: (policy: V1AdminTermsPolicy) => {
        const saved = form.documentId
          ? policy.documents.find((document) => document.documentId === form.documentId)
          : policy.documents.find((document) => document.version === body.version);
        if (saved) setForm(documentForm(saved));
        showToast(form.documentId ? '약관 초안을 저장했어요.' : '새 약관 버전을 만들었어요.', 'success');
      },
      onError: (mutationError) =>
        showToast(extractErrorMessage(mutationError, '약관 버전 저장에 실패했어요.'), 'error'),
    });
  }

  function submitStatus(status: 'published' | 'archived') {
    if (!selected || !form.documentId || !statusReason.trim()) {
      showToast('상태 변경 사유를 입력해 주세요.', 'error');
      return;
    }
    changeStatus.mutate(
      {
        policyId: selected.policyId,
        documentId: form.documentId,
        body: { status, reason: statusReason.trim() },
      },
      {
        onSuccess: (policy) => {
          const changed = policy.documents.find((document) => document.documentId === form.documentId);
          if (changed) setForm(documentForm(changed));
          setStatusReason('');
          showToast(status === 'published' ? '새 버전을 발행했어요.' : '약관 버전을 보관했어요.', 'success');
        },
        onError: (mutationError) =>
          showToast(extractErrorMessage(mutationError, '상태 변경에 실패했어요.'), 'error'),
      },
    );
  }

  const editable = canWrite && (creatingPolicy || form.status === 'draft');
  const errorMessage = isError ? extractErrorMessage(error, '약관 목록을 불러오지 못했어요.') : null;

  return (
    <>
      <AdminPageHeader
        eyebrow="콘텐츠"
        title="약관 관리"
        description="회원가입·대회 신청·하단 메뉴 약관을 버전 단위로 관리해요. 발행본은 수정하지 않고 새 버전으로 이어집니다."
        action={
          <button
            type="button"
            onClick={beginCreatePolicy}
            disabled={!canWrite || saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <FilePlus2 size={17} aria-hidden="true" />
            새 약관
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.65fr)]">
        <section className="min-w-0 space-y-3" aria-label="약관 정책 목록">
          <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
            <input
              className={fieldClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="정책명·코드 검색"
              aria-label="약관 검색"
            />
            <select
              className={fieldClass}
              value={context}
              onChange={(event) => setContext(event.target.value)}
              aria-label="노출 위치 필터"
            >
              <option value="">전체 위치</option>
              {Object.entries(contextLabel).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          {isPending ? <AdminTableSkeleton rows={6} /> : null}
          {errorMessage ? (
            <div className="space-y-3">
              <AdminEmpty title="약관을 불러오지 못했어요" description={errorMessage} />
              <button type="button" onClick={() => void refetch()} className="min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] text-sm font-semibold text-[var(--text-body)] hover:border-blue-300">
                다시 시도
              </button>
            </div>
          ) : null}
          {!isPending && !errorMessage && data?.items.length === 0 ? (
            <AdminEmpty title="등록된 약관이 없어요" description="새 약관을 만들어 주세요." />
          ) : null}
          <div className="space-y-2">
            {data?.items.map((policy) => {
              const current = policy.documents.find((document) => document.documentId === policy.currentDocumentId);
              const active = !creatingPolicy && selected?.policyId === policy.policyId;
              return (
                <button
                  type="button"
                  key={policy.policyId}
                  onClick={() => selectPolicy(policy)}
                  className={[
                    'w-full rounded-2xl border bg-[var(--card-surface)] p-4 text-left transition-colors',
                    active ? 'border-blue-400 ring-2 ring-blue-100' : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--text-strong)]">{policy.name}</p>
                      <p className="mt-1 truncate text-xs text-gray-400">{policy.code}</p>
                    </div>
                    <AdminStatusPill
                      status={current?.status ?? 'draft'}
                      label={current ? `${current.version} · ${statusLabel[current.status]}` : '버전 없음'}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {policy.placements.map((placement) => (
                      <span key={placement.placementId} className="rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                        {contextLabel[placement.context]} · {requirementLabel[placement.requirement]}
                      </span>
                    ))}
                    <span className="rounded-full bg-[var(--blue50)] px-2 py-1 text-[length:var(--font-size-caption)] text-[var(--blue700)]">
                      동의 {policy.documents.reduce((sum, document) => sum + document.consentEventCount, 0).toLocaleString('ko-KR')}건
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 md:p-5" aria-label="약관 편집">
          {!selected && !creatingPolicy ? (
            <AdminEmpty title="관리할 약관을 선택해 주세요" description="왼쪽 목록에서 약관을 선택하거나 새 약관을 만드세요." />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ScrollText size={19} className="text-[var(--blue700)]" aria-hidden="true" />
                    <h2 className="text-lg font-bold text-[var(--text-strong)]">{creatingPolicy ? '새 약관 정책' : selected?.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">발행된 본문은 감사 이력을 위해 수정할 수 없어요.</p>
                </div>
                {!creatingPolicy && canWrite ? (
                  <button type="button" onClick={beginNewVersion} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--tint-blue-border)] px-3 text-sm font-semibold text-[var(--blue700)] hover:bg-[var(--blue50)]">
                    <FilePlus2 size={15} aria-hidden="true" />
                    새 버전
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {creatingPolicy ? (
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-[var(--text-body)]">정책 코드</span>
                    <input className={fieldClass} value={newCode} onChange={(event) => setNewCode(event.target.value)} placeholder="예: signup_marketing" disabled={!canWrite} />
                  </label>
                ) : null}
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--text-body)]">관리 이름</span>
                  <input className={fieldClass} value={policyName} onChange={(event) => setPolicyName(event.target.value)} disabled={!canWrite} />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--text-strong)]">노출 위치</h3>
                  {!creatingPolicy ? (
                    <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <input type="checkbox" checked={policyActive} onChange={(event) => setPolicyActive(event.target.checked)} disabled={!canWrite} />
                      정책 활성화
                    </label>
                  ) : null}
                </div>
                {placements.map((placement, index) => (
                  <div key={`${placement.context}-${index}`} className="grid gap-2 rounded-xl bg-[var(--surface-soft)] p-3 sm:grid-cols-[1fr_1fr_90px_auto] sm:items-center">
                    <select className={fieldClass} value={placement.context} onChange={(event) => setPlacementContext(index, event.target.value as V1ManagedTermsContext)} disabled={!canWrite}>
                      {Object.entries(contextLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select className={fieldClass} value={placement.requirement} onChange={(event) => setPlacement(index, { requirement: event.target.value as V1ManagedTermsRequirement })} disabled={!canWrite}>
                      {requirementsForContext(placement.context).map((value) => <option key={value} value={value}>{requirementLabel[value]}</option>)}
                    </select>
                    <input className={fieldClass} type="number" min={0} max={1000} value={placement.displayOrder} onChange={(event) => setPlacement(index, { displayOrder: Number(event.target.value) })} disabled={!canWrite} aria-label="노출 순서" />
                    <label className="flex min-h-[44px] items-center gap-2 px-1 text-xs text-[var(--text-muted)]">
                      <input type="checkbox" checked={placement.isActive} onChange={(event) => setPlacement(index, { isActive: event.target.checked })} disabled={!canWrite} />
                      노출
                    </label>
                  </div>
                ))}
                {!creatingPolicy && canWrite ? (
                  <button type="button" onClick={savePolicySettings} disabled={saving} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-body)] hover:border-blue-300 disabled:opacity-50">
                    <ShieldCheck size={15} aria-hidden="true" />
                    노출 설정 저장
                  </button>
                ) : null}
              </div>

              {!creatingPolicy && selected ? (
                <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="약관 버전">
                  {selected.documents.map((document) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={form.documentId === document.documentId}
                      key={document.documentId}
                      onClick={() => setForm(documentForm(document))}
                      className={[
                        'shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold',
                        form.documentId === document.documentId ? 'border-blue-400 bg-[var(--blue50)] text-[var(--blue700)]' : 'border-[var(--border)] text-[var(--text-muted)]',
                      ].join(' ')}
                    >
                      {document.version} · {statusLabel[document.status]} · 동의 {document.consentEventCount.toLocaleString('ko-KR')}
                    </button>
                  ))}
                  {form.documentId === null ? <span className="shrink-0 rounded-xl bg-[var(--tint-orange)] px-3 py-2 text-xs font-semibold text-[var(--orange700)]">새 초안</span> : null}
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={submitDocument}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-[var(--text-body)]">버전</span>
                    <input className={fieldClass} value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} disabled={!editable} placeholder="v1.2" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-[var(--text-body)]">적용 예정일</span>
                    <input className={fieldClass} type="datetime-local" value={form.effectiveAt} onChange={(event) => setForm((current) => ({ ...current, effectiveAt: event.target.value }))} disabled={!editable} />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-[var(--text-body)]">기존 회원 적용 시점</span>
                    <input className={fieldClass} type="datetime-local" value={form.enforcementAt} onChange={(event) => setForm((current) => ({ ...current, enforcementAt: event.target.value }))} disabled={!editable} />
                  </label>
                  <label className="flex min-h-[44px] items-center gap-2 self-end rounded-xl bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-body)]">
                    <input type="checkbox" checked={form.requiresReconsent} onChange={(event) => setForm((current) => ({ ...current, requiresReconsent: event.target.checked }))} disabled={!editable} />
                    기존 동의자도 이 버전에 재동의
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--text-body)]">표시 제목</span>
                  <input className={fieldClass} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} disabled={!editable} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--text-body)]">서브 타이틀</span>
                  <input className={fieldClass} value={form.subtitle} onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))} disabled={!editable} placeholder="전체 조회에서 제목 아래에 표시할 설명" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--text-body)]">변경 요약</span>
                  <input className={fieldClass} value={form.changeSummary} onChange={(event) => setForm((current) => ({ ...current, changeSummary: event.target.value }))} disabled={!editable} placeholder="이 버전에서 바뀐 내용을 기록해 주세요." />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[var(--text-body)]">약관 본문</span>
                  <textarea className={`${fieldClass} min-h-[320px] resize-y py-3 leading-6`} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} disabled={!editable} />
                </label>

                {editable ? (
                  <button type="submit" disabled={saving || !canWrite} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    <Save size={16} aria-hidden="true" />
                    {creatingPolicy ? '정책과 초안 만들기' : form.documentId ? '초안 저장' : '새 버전 만들기'}
                  </button>
                ) : null}
              </form>

              {!creatingPolicy && form.documentId && canWrite && form.status !== 'archived' ? (
                <div className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-[var(--text-body)]">상태 변경 사유</span>
                    <input className={fieldClass} value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="감사 로그에 남을 사유" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {form.status === 'draft' ? (
                      <button type="button" onClick={() => submitStatus('published')} disabled={saving} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                        <Send size={15} aria-hidden="true" />
                        발행
                      </button>
                    ) : null}
                    <button type="button" onClick={() => submitStatus('archived')} disabled={saving} className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-body)] disabled:opacity-50">
                      <Archive size={15} aria-hidden="true" />
                      보관
                    </button>
                  </div>
                </div>
              ) : null}

              {/* 미리보기 본문은 자체 스크롤 영역에 담는다. 예전에는 약관 전문을 그대로 펼쳐
                  화면 높이가 4,851px(모바일 8.7화면)까지 늘어났고, 정작 편집 폼이 위쪽 20%로
                  밀려 스크롤을 되감아야 했다(2026-08-17 로컬 실측). */}
              <div className="rounded-2xl bg-[var(--surface-soft)] p-4">
                <p className="mb-3 text-xs font-bold text-[var(--text-muted)]">실제 본문 미리보기</p>
                <article className="mx-auto max-w-[680px] rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5 md:p-7">
                  <h3 className="text-xl font-bold text-[var(--text-strong)]">{form.title || '약관 제목'}</h3>
                  {form.subtitle ? <p className="mt-2 text-sm text-[var(--text-muted)]">{form.subtitle}</p> : null}
                  <p className="mt-1 text-xs text-gray-400">{form.version || '버전 미입력'}</p>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="약관 본문 미리보기"
                    className="mt-6 max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-[var(--text-body)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    {form.content || '약관 본문이 여기에 표시돼요.'}
                  </div>
                </article>
              </div>
            </div>
          )}
        </section>
      </div>
      <AdminToasts toasts={toasts} />
    </>
  );
}
