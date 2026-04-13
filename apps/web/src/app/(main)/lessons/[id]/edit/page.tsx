'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Save, Trash2, AlertTriangle, GraduationCap } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useToast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { useLesson, useUpdateLesson, useDeleteLesson } from '@/hooks/use-api';
import { formatAmount, extractErrorMessage } from '@/lib/utils';

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
  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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

  const handleSave = () => {
    if (!form.title || !form.coachName || !form.venueName || !form.lessonDate || !form.startTime || !form.endTime) {
      toast('error', '필수 항목을 입력해주세요');
      return;
    }
    updateLesson.mutate({ id: lessonId, data: form as unknown as Record<string, unknown> }, {
      onSuccess: () => {
        toast('success', '강좌 정보가 저장되었어요');
        router.push(`/lessons/${lessonId}`);
      },
      onError: (err) => {
        toast('error', extractErrorMessage(err, '강좌 수정에 실패했어요. 잠시 후 다시 시도해주세요'));
      },
    });
  };

  const handleDelete = () => {
    deleteLesson.mutate(lessonId, {
      onSuccess: () => {
        toast('success', '강좌가 삭제되었어요');
        router.push('/my/lessons');
      },
      onError: (err) => {
        toast('error', extractErrorMessage(err, '강좌 삭제에 실패했어요. 다시 시도해주세요'));
        setShowDeleteModal(false);
      },
    });
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

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <MobileGlassHeader className="gap-3">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl">
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-white truncate flex-1">강좌 수정</h1>
      </MobileGlassHeader>

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
                  className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-blue-500 bg-blue-500 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 text-gray-700 dark:text-gray-200'
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
                className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
                  form.type === t.value
                    ? 'border-blue-500 bg-blue-500 dark:border-blue-500 dark:bg-blue-500'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <p className={`text-base font-semibold ${form.type === t.value ? 'text-white dark:text-white' : 'text-gray-900 dark:text-white'}`}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 강좌 제목 */}
        <FormField label="강좌 제목" required htmlFor="lesson-edit-title" className="mb-5">
          <Input
            id="lesson-edit-title"
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="예: 초보자를 위한 풋살 기초 레슨"
          />
        </FormField>

        {/* 강좌 설명 */}
        <FormField label="강좌 설명" htmlFor="lesson-edit-description" className="mb-5">
          <Textarea
            id="lesson-edit-description"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="강좌에 대한 자세한 설명을 입력해주세요"
            rows={4}
            className="resize-none"
          />
        </FormField>

        {/* 코치명 */}
        <FormField label="코치명" required htmlFor="lesson-edit-coach-name" className="mb-5">
          <Input
            id="lesson-edit-coach-name"
            type="text"
            value={form.coachName}
            onChange={(e) => update('coachName', e.target.value)}
            placeholder="예: 김코치"
          />
        </FormField>

        {/* 코치 소개 */}
        <FormField label="코치 소개" htmlFor="lesson-edit-coach-bio" className="mb-5">
          <Textarea
            id="lesson-edit-coach-bio"
            value={form.coachBio}
            onChange={(e) => update('coachBio', e.target.value)}
            placeholder="코치 경력 및 자격증 등을 입력해주세요"
            rows={3}
            className="resize-none"
          />
        </FormField>

        {/* 장소명 */}
        <FormField label="장소명" required htmlFor="lesson-edit-venue-name" className="mb-5">
          <Input
            id="lesson-edit-venue-name"
            type="text"
            value={form.venueName}
            onChange={(e) => update('venueName', e.target.value)}
            placeholder="예: 난지천 풋살장"
          />
        </FormField>

        {/* 날짜 */}
        <FormField label="날짜" required htmlFor="lesson-edit-date" className="mb-5">
          <Input
            id="lesson-edit-date"
            type="date"
            value={form.lessonDate}
            onChange={(e) => update('lessonDate', e.target.value)}
          />
        </FormField>

        {/* 시간 */}
        <section className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="시작 시간" required htmlFor="lesson-edit-start-time">
              <Input
                id="lesson-edit-start-time"
                type="time"
                value={form.startTime}
                onChange={(e) => update('startTime', e.target.value)}
              />
            </FormField>
            <FormField label="종료 시간" required htmlFor="lesson-edit-end-time">
              <Input
                id="lesson-edit-end-time"
                type="time"
                value={form.endTime}
                onChange={(e) => update('endTime', e.target.value)}
              />
            </FormField>
          </div>
        </section>

        {/* 인원 / 수강료 */}
        <section className="mb-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="최대 인원" htmlFor="lesson-edit-max-participants">
              <Input
                id="lesson-edit-max-participants"
                type="number"
                value={form.maxParticipants}
                onChange={(e) => update('maxParticipants', +e.target.value)}
                min={1}
                max={50}
              />
            </FormField>
            <FormField
              label="수강료 (원)"
              htmlFor="lesson-edit-fee"
              hint={form.fee > 0 ? formatAmount(form.fee) : undefined}
            >
              <Input
                id="lesson-edit-fee"
                type="number"
                value={form.fee}
                onChange={(e) => update('fee', +e.target.value)}
                min={0}
                step={1000}
              />
            </FormField>
          </div>
        </section>

        {/* 레벨 */}
        <section className="mb-6">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="최소 레벨" htmlFor="lesson-edit-level-min">
              <Select
                id="lesson-edit-level-min"
                value={form.levelMin}
                onChange={(e) => update('levelMin', +e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>{levelLabel[l]}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="최대 레벨" htmlFor="lesson-edit-level-max">
              <Select
                id="lesson-edit-level-max"
                value={form.levelMax}
                onChange={(e) => update('levelMax', +e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>{levelLabel[l]}</option>
                ))}
              </Select>
            </FormField>
          </div>
        </section>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8 mt-10">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3.5 text-base font-semibold text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={16} />
            삭제
          </button>
          <button
            onClick={handleSave}
            disabled={updateLesson.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {updateLesson.isPending ? '저장 중...' : '수정 완료'}
          </button>
        </div>
      </div>

      <div className="h-24" />

      {/* Delete confirmation modal */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} size="sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 mb-4">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">강좌를 삭제하시겠어요?</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">삭제하면 되돌릴 수 없어요.</p>
          <div className="mt-6 flex gap-3 w-full">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              돌아가기
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteLesson.isPending}
              className="flex-1 rounded-xl bg-red-500 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleteLesson.isPending ? '삭제 중...' : '삭제하기'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
