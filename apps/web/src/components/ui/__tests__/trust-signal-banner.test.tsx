import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustSignalBanner } from '../trust-signal-banner';

describe('TrustSignalBanner', () => {
  it('renders label, title, and description', () => {
    render(
      <TrustSignalBanner
        label="연결 예정"
        title="수강권 목록은 준비 중이에요"
        description="실데이터가 준비되면 이 화면이 열립니다."
      />,
    );

    expect(screen.getByText('연결 예정')).toBeInTheDocument();
    expect(screen.getByText('수강권 목록은 준비 중이에요')).toBeInTheDocument();
    expect(screen.getByText('실데이터가 준비되면 이 화면이 열립니다.')).toBeInTheDocument();
  });

  it('applies warning tone styling when requested', () => {
    const { container } = render(
      <TrustSignalBanner
        tone="warning"
        label="예시 이미지"
        title="대표 이미지를 대신 보여줘요"
        description="실제 사진 등록 전까지 임시 이미지가 노출됩니다."
      />,
    );

    expect(container.firstChild).toHaveClass('border-amber-200');
    expect(screen.getByText('예시 이미지')).toBeInTheDocument();
  });
});
