'use client';

import { useState } from 'react';
import { Megaphone, Send, Pencil, Trash2 } from 'lucide-react';
import { useV1AdminAnnouncements, useV1CreateAnnouncement, useV1DeleteAnnouncement, useV1PublishAnnouncement, useV1UpdateAnnouncement } from '@/hooks/use-v1-api';
import type { V1AdminTournamentAnnouncement, V1AnnouncementAudience, V1AnnouncementCategory } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { getTournamentAnnouncementCategoryLabel } from '@/components/tournaments/tournament-announcement-category';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import { formatDate } from './tournament-admin-shared';
import {
  inputCls,
  submitBtnCls,
  textareaCls,
} from './tournament-detail-shared';


// ── Tab: Announcements ────────────────────────────────────────────────────

export function AnnouncementsTab({
  tournamentId,
  canWrite,
  showToast,
}: {
  tournamentId: string;
  canWrite: boolean;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const { data: annData, isPending: annPending, isError: annError, error: annErr, refetch: annRefetch } = useV1AdminAnnouncements(tournamentId);
  const announcements = annData?.items ?? [];
  const createAnnouncement = useV1CreateAnnouncement(tournamentId);
  const updateAnnouncement = useV1UpdateAnnouncement(tournamentId);
  const publishAnnouncement = useV1PublishAnnouncement(tournamentId);
  const deleteAnnouncement = useV1DeleteAnnouncement(tournamentId);

  const [editingAnnouncement, setEditingAnnouncement] = useState<V1AdminTournamentAnnouncement | null>(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annCategory, setAnnCategory] = useState<V1AnnouncementCategory>('general');
  const [annAudience, setAnnAudience] = useState<V1AnnouncementAudience>('all_registered');
  const [annPublish, setAnnPublish] = useState(false);
  const isSavingAnnouncement = createAnnouncement.isPending || updateAnnouncement.isPending;

  const resetAnnouncementForm = () => {
    setEditingAnnouncement(null);
    setAnnTitle('');
    setAnnBody('');
    setAnnCategory('general');
    setAnnAudience('all_registered');
    setAnnPublish(false);
  };

  const startEditAnnouncement = (ann: V1AdminTournamentAnnouncement) => {
    setEditingAnnouncement(ann);
    setAnnTitle(ann.title);
    setAnnBody(ann.body);
    setAnnCategory(ann.category);
    setAnnAudience(ann.audience as V1AnnouncementAudience);
    setAnnPublish(Boolean(ann.publishedAt));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    const payload = {
      title: annTitle.trim(),
      body: annBody.trim(),
      category: annCategory,
      audience: annAudience,
      publish: annPublish,
    };
    if (editingAnnouncement) {
      updateAnnouncement.mutate(
        {
          announcementId: editingAnnouncement.id,
          body: payload,
        },
        {
          onSuccess: () => {
            resetAnnouncementForm();
            showToast('공지를 수정했어요.', 'success');
          },
          onError: (err) =>
            showToast(extractErrorMessage(err, '공지 수정에 실패했어요.'), 'error'),
        },
      );
      return;
    }
    createAnnouncement.mutate(
      {
        title: annTitle.trim(),
        body: annBody.trim(),
        category: annCategory,
        audience: annAudience,
        publish: annPublish,
      },
      {
        onSuccess: () => {
          resetAnnouncementForm();
          showToast('공지를 작성했어요.', 'success');
        },
        onError: (err) =>
          showToast(extractErrorMessage(err, '공지 작성에 실패했어요.'), 'error'),
      },
    );
  };

  const handlePublish = (announcementId: string) => {
    publishAnnouncement.mutate(announcementId, {
      onSuccess: (res) => {
        if (res.alreadyPublished) {
          showToast('이미 발행된 공지예요.', 'success');
        } else {
          showToast('공지를 발행했어요.', 'success');
        }
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '공지 발행에 실패했어요.'), 'error'),
    });
  };

  const handleDelete = (ann: V1AdminTournamentAnnouncement) => {
    const confirmed = window.confirm(`"${ann.title}" 공지를 삭제할까요? 삭제한 공지는 복구할 수 없어요.`);
    if (!confirmed) return;
    deleteAnnouncement.mutate(ann.id, {
      onSuccess: () => {
        if (editingAnnouncement?.id === ann.id) resetAnnouncementForm();
        showToast('공지를 삭제했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '공지 삭제에 실패했어요.'), 'error'),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── 공지 작성 폼 ─────────────────────────────────────────────── */}
      {!canWrite && (
        <p
          className="rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]"
          role="status"
        >
          조회 전용 권한으로 접속했어요. 공지를 작성하거나 변경하려면 운영 권한이 필요해요.
        </p>
      )}
      {canWrite && (
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-5">
        <h3 className="text-[15px] font-bold text-[var(--text-strong)] mb-4">공지 작성</h3>
        {editingAnnouncement && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--blue50)] px-3 py-2 text-xs text-[var(--blue700)]">
            <span className="font-medium">선택한 공지를 수정 중이에요.</span>
            <button
              type="button"
              onClick={resetAnnouncementForm}
              disabled={isSavingAnnouncement}
              className="inline-flex items-center min-h-[36px] rounded-lg bg-[var(--card-surface)] px-3 font-medium text-[var(--blue700)] hover:bg-blue-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              취소
            </button>
          </div>
        )}
        <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-title" className="text-[13px] text-[var(--text-strong)]">
              제목 <span className="text-red-500" aria-hidden="true">*</span>
              <span className="sr-only">(필수)</span>
            </label>
            <input
              id="ann-title"
              type="text"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              disabled={isSavingAnnouncement}
              placeholder="공지 제목"
              maxLength={100}
              required
              aria-required="true"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ann-body" className="text-[13px] text-[var(--text-strong)]">
              내용 <span className="text-red-500" aria-hidden="true">*</span>
              <span className="sr-only">(필수)</span>
            </label>
            <textarea
              id="ann-body"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              disabled={isSavingAnnouncement}
              rows={4}
              placeholder="공지 내용을 입력해 주세요."
              required
              aria-required="true"
              className={textareaCls}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="ann-category" className="text-[13px] text-[var(--text-strong)]">
                분류
              </label>
              <select
                id="ann-category"
                value={annCategory}
                onChange={(e) => setAnnCategory(e.target.value as V1AnnouncementCategory)}
                disabled={isSavingAnnouncement}
                className={inputCls}
              >
                <option value="general">일반</option>
                <option value="venue">장소·준비</option>
                <option value="sponsor">협찬·이벤트</option>
                <option value="media">미디어</option>
                <option value="results">결과</option>
                <option value="review">리뷰</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label htmlFor="ann-audience" className="text-[13px] text-[var(--text-strong)]">
                대상
              </label>
              <select
                id="ann-audience"
                value={annAudience}
                onChange={(e) => setAnnAudience(e.target.value as V1AnnouncementAudience)}
                disabled={isSavingAnnouncement}
                className={inputCls}
              >
                <option value="public">전체 공개</option>
                <option value="all_registered">모든 신청팀</option>
                <option value="confirmed_only">확정팀만</option>
                <option value="waitlist">대기팀만</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-[var(--text-strong)] cursor-pointer min-h-[44px] self-end sm:pb-0.5">
              <input
                type="checkbox"
                checked={annPublish}
                onChange={(e) => setAnnPublish(e.target.checked)}
                disabled={isSavingAnnouncement}
                className="w-4 h-4 rounded accent-blue-500"
              />
              즉시 발행
            </label>
          </div>

          <button
            type="submit"
            disabled={!annTitle.trim() || !annBody.trim() || isSavingAnnouncement}
            className={submitBtnCls}
          >
            <Megaphone size={15} aria-hidden="true" />
            {isSavingAnnouncement ? '저장 중…' : editingAnnouncement ? '공지 수정' : '공지 작성'}
          </button>
        </form>
      </div>
      )}

      {/* ── 공지 목록 ─────────────────────────────────────────────────── */}
      {(annPending || annError) && (
        <AdminDataTable
          columns={[]}
          rows={[]}
          keyExtractor={() => ''}
          loading={annPending}
          error={annError ? extractErrorMessage(annErr, '공지 목록을 불러오지 못했어요.') : undefined}
          onRetry={() => void annRefetch()}
        />
      )}
      {!annPending && !annError && announcements.length === 0 && (
        <AdminEmpty title="공지가 없어요" description="아직 작성된 공지가 없어요." />
      )}
      {!annPending && !annError && announcements.length > 0 && (
        <div className="flex flex-col gap-3">
          {announcements.map((ann) => (
            <div key={ann.id} className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[var(--text-strong)] mb-0.5 truncate">{ann.title}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {getTournamentAnnouncementCategoryLabel(ann.category)}
                    {' '}·{' '}
                    {ann.publishedAt ? `발행됨 · ${formatDate(ann.publishedAt)}` : '미발행'}
                    {' '}·{' '}
                    {ann.audience === 'public'
                      ? '전체 공개'
                      : ann.audience === 'all_registered'
                      ? '모든 신청팀'
                      : ann.audience === 'confirmed_only'
                      ? '확정팀만'
                      : '대기팀만'}
                  </p>
                </div>
                {canWrite && !ann.publishedAt && (
                  <button
                    type="button"
                    onClick={() => handlePublish(ann.id)}
                    disabled={publishAnnouncement.isPending}
                    aria-label={`"${ann.title}" 발행`}
                    className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-blue-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 shrink-0"
                  >
                    <Send size={12} aria-hidden="true" />
                    발행
                  </button>
                )}
              </div>
              {canWrite && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEditAnnouncement(ann)}
                  disabled={isSavingAnnouncement || deleteAnnouncement.isPending}
                  aria-label={`"${ann.title}" 수정`}
                  className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg text-xs font-medium text-[var(--text-body)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <Pencil size={12} aria-hidden="true" />
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ann)}
                  disabled={deleteAnnouncement.isPending}
                  aria-label={`"${ann.title}" 삭제`}
                  className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-lg text-xs font-medium text-[var(--red700)] bg-[var(--red50)] hover:bg-red-100 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2"
                >
                  <Trash2 size={12} aria-hidden="true" />
                  삭제
                </button>
              </div>
              )}
              <p className="mt-2 text-[13px] text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed">
                {ann.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
