import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentImagesField } from './tournament-images-field';

describe('TournamentImagesField 상세 이미지 설명', () => {
  it('표시 상태를 전환해도 연결된 안내가 한글 어절과 긴 단어의 줄바꿈을 지원한다', () => {
    function Form() {
      const [visible, setVisible] = useState(true);
      return <TournamentImagesField coverImageUrl={null} listImageUrl={null} showDetailImage={visible}
        onImageChange={vi.fn()} onVisibilityChange={setVisible} onUpload={vi.fn().mockResolvedValue('/uploads/image.webp')} />;
    }
    render(<Form />);
    const toggle = screen.getByRole('switch', { name: '상세 이미지 표시' });
    const shown = screen.getByText(/상세 이미지가 없으면 목록 이미지를 사용하고/);
    expect(toggle).toHaveAccessibleDescription(/상세 이미지가 없으면 목록 이미지를 사용하고/);
    expect(shown).toHaveStyle({ wordBreak: 'keep-all', overflowWrap: 'anywhere' });

    fireEvent.click(toggle);
    const hidden = screen.getByText(/상세에서 기본 이미지와 이미지 영역을 모두 숨겨요/);
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/상세에서 기본 이미지와 이미지 영역을 모두 숨겨요/);
    expect(hidden).toHaveStyle({ wordBreak: 'keep-all', overflowWrap: 'anywhere' });
  });
});
