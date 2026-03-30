'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Save, Trash2, AlertTriangle, GraduationCap } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useToast } from '@/components/ui/toast';
import { useLesson } from '@/hooks/use-api';
import { api } from '@/lib/api';

const sports = [
  { type: 'futsal', label: '풋살' },
  { type: 'basketball', label: '농구' },
  { type: 'badminton', label: '배드민턴' },
  { type: 'ice_hockey', label: '아이스하키' },
];

const lessonTypes = [
  { value: 'group_lesson', label: '그룹 레슨', desc: '여러 명이 함께 배우는 레슨' },
  { value: 'practice_match', label: '연습 경기', desc: '실전 감각을 키우는 연습 경기' },
  { value: 'free_practice', label: '자유 연습', desc: '자유롭게 연습하는 시간' },
  { value: 'clinic', label: '클리닉', desc: '전문 코치의 집중 클리닉' },
];

const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

interface FormData {
  sportType: string;
  type: string;
  title: string;
  description: string;
  coachName: string;
  coachBio: string;
  venueName: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  fee: number;
  levelMin: number;
  levelMax: number;
}

export default function EditLessonPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const lessonId = params.id as string;

  const { data: lesson, isLoading } = useLesson(lessonId);

  const [form, setForm] = useState<FormData>({
    sportType: '',
    type: '',
    title: '',
    description: '',
    coachName: '',
    coachBio: '',
    venueName: '',
    lessonDate: '',
    startTime: '',
    endTime: '',
    maxParticipants: 10,
    fee: 20000,
    levelMin: 1,
    levelMax: 5,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (lesson) {
      setForm({
        sportType: lesson.sportType || '',
        type: lesson.type || '',
        title: lesson.title || '',
        description: lesson.description || '',
        coachName: lesson.coachName || '',
        coachBio: lesson.coachBio || '',
        venueName: lesson.venueName || '',
        lessonDate: lesson.lessonDate || '',
        startTime: lesson.startTime || '',
        endTime: lesson.endTime || '',
        maxParticipants: lesson.maxParticipants ?? 10,
        fee: lesson.fee ?? 20000,
        levelMin: lesson.levelMin ?? 1,
        levelMax: lesson.levelMax ?? 5,
      });
    }
  }, [lesson]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSave = async () => {
    if (!form.title || !form.coachName || !form.venueName || !form.lessonDate || !form.startTime || !form.endTime) {
      toast('error', '필수 항목을 입력해주세요');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.patch(`/lessons/${lessonId}`, form);
      toast('success', '강좌 정보가 저장되었어요');
      router.push(`/lessons/${lessonId}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '강좌 수정에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/lessons/${lessonId}`);
      toast('success', '강좌가 삭제되었어요');
      router.push('/my/lessons');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '강좌 삭제에 실패했어요. 다시 시도해주세요');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded-xl" />
          <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded-xl" />
          <div className="h-48 bg-gray-100 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={GraduationCap}
          title="강좌를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 강좌예요"
          action={{ label: '목록으로', href: '/lessons' }}
        />
      </div>
    );
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3.5 text-base text-gray-900 dark:text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white dark:focus:bg-gray-800 transition-colors';
  const selectClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3.5 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 focus:bg-white dark:focus:bg-gray-800 transition-colors';

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center gap-3 px-5 py-3 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm z-10 border-b border-gray-50 dark:border-gray-800">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1">강좌 수정</h1>
      </header>

      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/lessons" className="hover:text-gray-600">강좌</Link>
        <ChevronRight size={14} />
        <Link href={`/lessons/${lessonId}`} className="hover:text-gray-600">{lesson.title}</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-200">수정</span>
      </div>

      <div className="px-5 @3xl:px-0 max-w-2xl">
        {/* 종목 선택 */}
        <section className="mb-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">종목 선택</label>
          <div className="grid grid-cols-2 gap-3">
            {sports.map((s) => {
              const Icon = SportIconMap[s.type];
              const selected = form.sportType === s.type;
              return (
                <button
                  key={s.type}
                  onClick={() => update('sportType', s.type)}
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
                    selected
                      ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900 dark:border-white'
                      : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-200 text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {Icon && <Icon size={28} />}
                  <span className="text-md font-semibold">{s.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 강좌 유형 */}
        <section className="mb-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">강좌 유형</label>
          <div className="space-y-2">
            {lessonTypes.map((t) => (
              <button
                key={t.value}
                onClick={() => update('type', t.value)}
                className={`w-full rounded-xl border-2 px-4 py-3.5 text-left transition-colors ${
                  form.type === t.value
                    ? 'border-gray-900 bg-gray-900 dark:border-white dark:bg-white'
                    : 'border-gray-100 dark:border-gray-700 hover:border-gray-200'
                }`}
              >
                <p className={`text-base font-semibold ${form.type === t.value ? 'text-white dark:text-gray-900' : 'text-gray-900 dark:text-white'}`}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 강좌 제목 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            강좌 제목 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="예: 초보자를 위한 풋살 기초 레슨"
            className={inputClass}
          />
        </section>

        {/* 강좌 설명 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">강좌 설명</label>
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="강좌에 대한 자세한 설명을 입력해주세요"
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </section>

        {/* 코치명 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            코치명 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.coachName}
            onChange={(e) => update('coachName', e.target.value)}
            placeholder="예: 김코치"
            className={inputClass}
          />
        </section>

        {/* 코치 소개 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">코치 소개</label>
          <textarea
            value={form.coachBio}
            onChange={(e) => update('coachBio', e.target.value)}
            placeholder="코치 경력 및 자격증 등을 입력해주세요"
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </section>

        {/* 장소명 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            장소명 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.venueName}
            onChange={(e) => update('venueName', e.target.value)}
            placeholder="예: 난지천 풋살장"
            className={inputClass}
          />
        </section>

        {/* 날짜 */}
        <section className="mb-5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
            날짜 <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={form.lessonDate}
            onChange={(e) => update('lessonDate', e.target.value)}
            className={inputClass}
          />
        </section>

        {/* 시간 */}
        <section className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
                시작 시간 <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => update('startTime', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">
                종료 시간 <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => update('endTime', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* 인원 / 수강료 */}
        <section className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">최대 인원</label>
              <input
                type="number"
                value={form.maxParticipants}
                onChange={(e) => update('maxParticipants', +e.target.value)}
                min={1}
                max={50}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">수강료 (원)</label>
              <input
                type="number"
                value={form.fee}
                onChange={(e) => update('fee', +e.target.value)}
                min={0}
                step={1000}
                className={inputClass}
              />
              {form.fee > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {new Intl.NumberFormat('ko-KR').format(form.fee)}원
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 레벨 */}
        <section className="mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">최소 레벨</label>
              <select
                value={form.levelMin}
                onChange={(e) => update('levelMin', +e.target.value)}
                className={selectClass}
              >
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>{levelLabel[l]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block">최대 레벨</label>
              <select
                value={form.levelMax}
                onChange={(e) => update('levelMax', +e.target.value)}
                className={selectClass}
              >
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>{levelLabel[l]}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3.5 text-base font-semibold text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={16} />
            삭제
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={16} />
            {isSubmitting ? '저장 중...' : '수정 완료'}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6 animate-fade-in">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">강좌를 삭제하시겠어요?</h3>
            <p className="text-base text-gray-500 text-center mt-2">삭제하면 되돌릴 수 없어요.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDeleting ? '삭제 중...' : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
