'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Save, Trash2, AlertTriangle, UserPlus } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useDeleteMercenaryPost, useMercenaryPost, useUpdateMercenaryPost } from '@/hooks/use-api';
import { levelLabel, sportCardAccent, sportLabel } from '@/lib/constants';
import { extractErrorMessage, formatCurrency } from '@/lib/utils';
import type { UpdateMercenaryPostInput } from '@/types/api';

const positionOptions = [
  { value: 'GK', label: 'GK' },
  { value: 'DF', label: 'DF' },
  { value: 'MF', label: 'MF' },
  { value: 'FW', label: 'FW' },
  { value: 'ALL', label: '무관' },
];

const levelOptions = [
  { value: 1, label: '입문' },
  { value: 2, label: '초급' },
  { value: 3, label: '중급' },
  { value: 4, label: '상급' },
  { value: 5, label: '고수' },
];

interface FormData {
  matchDate: string;
  venue: string;
  position: string;
  count: number;
  level: number;
  fee: number;
  notes: string;
}

function toDateInputValue(value: string): string {
  if (!value) return '';
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

export default function EditMercenaryPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;

  const { data: post, isLoading } = useMercenaryPost(id);
  const updateMutation = useUpdateMercenaryPost();
  const deleteMutation = useDeleteMercenaryPost();

  const [form, setForm] = useState<FormData>({
    matchDate: '',
    venue: '',
    position: 'ALL',
    count: 1,
    level: 3,
    fee: 0,
    notes: '',
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (!post) return;
    setForm({
      matchDate: toDateInputValue(post.matchDate),
      venue: post.venue ?? '',
      position: post.position ?? 'ALL',
      count: post.count ?? 1,
      level: post.level ?? 3,
      fee: post.fee ?? 0,
      notes: post.notes ?? post.description ?? '',
    });
  }, [post]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = !!form.matchDate && !!form.venue && !!form.position;

  async function handleSave() {
    if (!canSubmit) {
      toast('error', '필수 항목을 입력해주세요');
      return;
    }

    const payload: UpdateMercenaryPostInput = {
      matchDate: form.matchDate,
      venue: form.venue,
      position: form.position,
      count: form.count,
      level: form.level,
      fee: form.fee,
      notes: form.notes.trim() ? form.notes : undefined,
    };

    try {
      await updateMutation.mutateAsync({ id, data: payload });
      toast('success', '용병 모집글이 수정되었어요');
      router.push(`/mercenary/${id}`);
    } catch (error) {
      toast('error', extractErrorMessage(error, '수정에 실패했어요. 잠시 후 다시 시도해주세요'));
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(id);
      toast('success', '용병 모집글이 삭제되었어요');
      router.push('/my/mercenary');
    } catch (error) {
      toast('error', extractErrorMessage(error, '삭제하지 못했어요. 다시 시도해주세요'));
    } finally {
      setShowDeleteModal(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-5 pt-8 text-center text-gray-500 dark:text-gray-400">로딩 중...</div>
    );
  }

  if (!post) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={UserPlus}
          title="모집글을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 모집글이에요"
          action={{ label: '목록으로', href: '/mercenary' }}
        />
      </div>
    );
  }

  if (!post.viewer?.isAuthor && !post.viewer?.canManage) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={AlertTriangle}
          title="수정 권한이 없어요"
          description="작성자 또는 팀 매니저만 모집글을 수정할 수 있습니다."
          action={{ label: '상세로 돌아가기', href: `/mercenary/${id}` }}
        />
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white dark:focus:bg-gray-800 transition-colors';
  const accent = sportCardAccent[post.sportType];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader className="gap-3">
        <button aria-label="뒤로 가기" onClick={() => router.back()} className="glass-mobile-icon-button flex min-h-[44px] min-w-11 items-center justify-center rounded-xl">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">용병 모집 수정</h1>
      </MobileGlassHeader>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/mercenary" className="hover:text-gray-600">용병</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">수정</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl">
        <section className={`mb-5 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 ${accent?.tint ?? 'bg-gray-50 dark:bg-gray-800/60'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{post.team?.name ?? '소속 팀'}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">종목은 팀 정보 기준으로 고정됩니다.</p>
            </div>
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${accent?.badge ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
              {sportLabel[post.sportType] ?? post.sportType}
            </span>
          </div>
        </section>

        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            팀명
          </label>
          <div className={`${inputClass} cursor-not-allowed opacity-80`}>
            {post.team?.name ?? '—'}
          </div>
        </section>

        <section className="mb-5">
          <label htmlFor="mercenary-edit-match-date" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            경기 날짜 <span className="text-red-400">*</span>
          </label>
          <input
            id="mercenary-edit-match-date"
            type="date"
            value={form.matchDate}
            onChange={(e) => update('matchDate', e.target.value)}
            className={inputClass}
          />
        </section>

        <section className="mb-5">
          <label htmlFor="mercenary-edit-venue" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            장소 <span className="text-red-400">*</span>
          </label>
          <input
            id="mercenary-edit-venue"
            type="text"
            value={form.venue}
            onChange={(e) => update('venue', e.target.value)}
            placeholder="예: 강남 풋살파크"
            className={inputClass}
          />
        </section>

        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">포지션</label>
          <div className="flex gap-2">
            {positionOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => update('position', option.value)}
                className={`flex-1 rounded-xl border py-3 text-base font-semibold text-center transition-colors ${
                  form.position === option.value
                    ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mercenary-edit-count" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">모집 인원</label>
              <input
                id="mercenary-edit-count"
                type="number"
                value={form.count}
                onChange={(e) => update('count', Math.max(1, Number(e.target.value) || 1))}
                min={1}
                max={10}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="mercenary-edit-fee" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">참가비 (원)</label>
              <input
                id="mercenary-edit-fee"
                type="number"
                value={form.fee}
                onChange={(e) => update('fee', Math.max(0, Number(e.target.value) || 0))}
                min={0}
                step={1000}
                className={inputClass}
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(form.fee)}</p>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">요구 레벨</label>
          <div className="flex gap-2">
            {levelOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => update('level', option.value)}
                className={`flex-1 rounded-xl border py-3 text-base font-semibold text-center transition-colors ${
                  form.level === option.value
                    ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                }`}
              >
                {levelLabel[option.value] ?? option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <label htmlFor="mercenary-edit-notes" className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">비고</label>
          <textarea
            id="mercenary-edit-notes"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="추가 안내사항을 입력해주세요"
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </section>

        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-800 px-5 py-3.5 text-base font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={16} />
            삭제
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSubmit || updateMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {updateMutation.isPending ? '저장 중...' : '수정 완료'}
          </button>
        </div>
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="모집글 삭제" size="sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 mx-auto mb-4">
          <AlertTriangle size={24} className="text-red-500" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">모집글을 삭제하시겠어요?</h3>
        <p className="text-base text-gray-500 dark:text-gray-400 text-center mt-2">삭제하면 되돌릴 수 없어요.</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setShowDeleteModal(false)}
            className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            돌아가기
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={deleteMutation.isPending}
            className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {deleteMutation.isPending ? '삭제 중...' : '삭제하기'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
