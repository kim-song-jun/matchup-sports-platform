'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, UserProfile } from '@/types/api';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    nickname: user?.nickname || '',
    bio: user?.bio || '',
    phone: (user?.['phone'] as string) || '',
    locationCity: user?.locationCity || '',
    locationDistrict: user?.locationDistrict || '',
  });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.patch('/users/me', form);
      const updated = (res as unknown as ApiResponse<UserProfile>).data;
      setUser(updated as never);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast('success', '프로필이 수정되었어요');
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast('error', axiosErr?.response?.data?.message || '수정에 실패했어요. 잠시 후 다시 시도해주세요');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="프로필 수정">
      <div className="space-y-4">
        <div>
          <label htmlFor="profile-nickname" className="block text-sm font-semibold text-gray-700 mb-1.5">닉네임</label>
          <input id="profile-nickname" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-colors" />
        </div>
        <div>
          <label htmlFor="profile-bio" className="block text-sm font-semibold text-gray-700 mb-1.5">한 줄 소개</label>
          <textarea id="profile-bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={2} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none focus:border-blue-300 focus:bg-white resize-none transition-colors" />
        </div>
        <div>
          <label htmlFor="profile-phone" className="block text-sm font-semibold text-gray-700 mb-1.5">연락처</label>
          <input id="profile-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="010-0000-0000" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none focus:border-blue-300 focus:bg-white transition-colors" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="profile-city" className="block text-sm font-semibold text-gray-700 mb-1.5">시/도</label>
            <input id="profile-city" value={form.locationCity} onChange={(e) => setForm({ ...form, locationCity: e.target.value })}
              placeholder="서울" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none focus:border-blue-300 focus:bg-white transition-colors" />
          </div>
          <div>
            <label htmlFor="profile-district" className="block text-sm font-semibold text-gray-700 mb-1.5">구/군</label>
            <input id="profile-district" value={form.locationDistrict} onChange={(e) => setForm({ ...form, locationDistrict: e.target.value })}
              placeholder="마포구" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none focus:border-blue-300 focus:bg-white transition-colors" />
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-3 text-md font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          취소
        </button>
        <button onClick={handleSubmit} disabled={isSubmitting}
          className="flex-1 rounded-xl bg-blue-500 py-3 text-md font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors">
          {isSubmitting ? '저장 중...' : '저장'}
        </button>
      </div>
    </Modal>
  );
}
