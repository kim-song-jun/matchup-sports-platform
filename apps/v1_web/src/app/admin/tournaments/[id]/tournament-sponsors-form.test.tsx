import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { publicAssetPath } from '@/lib/assets';
import { emptySponsorForm } from './tournament-sponsors-admin-model';
import { TournamentSponsorForm } from './tournament-sponsors-form';

function renderForm(overrides: Partial<Parameters<typeof TournamentSponsorForm>[0]> = {}) {
  const props: Parameters<typeof TournamentSponsorForm>[0] = {
    form: emptySponsorForm,
    mode: 'create',
    pending: false,
    uploadingLogo: false,
    onSelectLogo: vi.fn(),
    onSubmit: vi.fn(),
    setField: vi.fn(),
    ...overrides,
  };
  return { ...render(<TournamentSponsorForm {...props} />), props };
}

describe('TournamentSponsorForm', () => {
  it('accepts an image file instead of exposing a logo URL input', () => {
    const { props } = renderForm();
    const file = new File(['logo'], 'partner-logo.png', { type: 'image/png' });

    expect(screen.queryByLabelText('로고 URL')).not.toBeInTheDocument();
    const input = screen.getByLabelText('협찬사 로고 파일 선택');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');

    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onSelectLogo).toHaveBeenCalledWith(file);
  });

  it('previews and removes an uploaded logo URL through the form contract', () => {
    const setField = vi.fn();
    renderForm({
      form: { ...emptySponsorForm, logoUrl: '/uploads/2026/08/partner.webp' },
      setField,
    });

    expect(screen.getByAltText('선택한 협찬사 로고 미리보기')).toHaveAttribute(
      'src',
      publicAssetPath('/uploads/2026/08/partner.webp'),
    );
    // 공용 CoverImageUploader 재사용으로 제거 버튼 라벨이 공용 문구('이미지 제거')가 됐다 —
    // 계약(누르면 logoUrl 을 비운다)은 동일.
    fireEvent.click(screen.getByRole('button', { name: '이미지 제거' }));
    expect(setField).toHaveBeenCalledWith('logoUrl', '');
  });

  // motion-audit 그룹6(F5 admin button press) — active:scale-[0.98] 가
  // transition-colors 안에만 있어 transform 이 transition-property 에서 빠져 있었다
  // (Tailwind의 transition-colors는 color/background-color/border-color 등만 대상으로
  // 하고 transform은 포함하지 않는다) → 눌렀다 뗄 때 스케일이 0ms 로 즉시 스냅했다.
  it('제출 버튼이 transition-transform 을 가져 active:scale press 가 스냅하지 않는다', () => {
    renderForm();

    const submitBtn = screen.getByRole('button', { name: '협찬 추가' });
    expect(submitBtn).toHaveClass('transition-transform');
    expect(submitBtn.className).toMatch(/active:scale-\[0\.98\]/);
  });

  it('blocks saving and reports the real error while the logo upload is unresolved', () => {
    renderForm({
      form: { ...emptySponsorForm, name: '파트너사' },
      uploadingLogo: true,
      logoUploadError: '이미지 형식을 확인해 주세요.',
    });

    expect(screen.getByRole('button', { name: '협찬 추가' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('이미지 형식을 확인해 주세요.');
  });
});
