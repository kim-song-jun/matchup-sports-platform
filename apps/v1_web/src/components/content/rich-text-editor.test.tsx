import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_RICH_CONTENT } from '@/lib/rich-content';
import type { V1RichContentDocument, V1RichContentNode } from '@/types/api';
import { RichTextEditor } from './rich-text-editor';

const firstAsset = {
  assetId: '123e4567-e89b-42d3-a456-426614174000',
  url: '/uploads/2026/07/123e4567-e89b-42d3-a456-426614174000.webp',
  status: 'temporary' as const,
};

function imageNodes(document: V1RichContentDocument) {
  const images: V1RichContentNode[] = [];
  const visit = (node: V1RichContentNode) => {
    if (node.type === 'image') images.push(node);
    node.content?.forEach(visit);
  };
  visit(document);
  return images;
}

describe('RichTextEditor managed images', () => {
  it('serializes the actual Tiptap 3.28 image defaults used by the API boundary', async () => {
    const onChange = vi.fn();
    const onUploadImage = vi.fn().mockResolvedValue(firstAsset);
    const { container } = render(
      <RichTextEditor value={EMPTY_RICH_CONTENT} onChange={onChange} onUploadImage={onUploadImage} />,
    );
    const file = new File(['image'], 'match-photo.webp', { type: 'image/webp' });

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(file));
    await waitFor(() => {
      const document = onChange.mock.calls.at(-1)?.[0] as V1RichContentDocument | undefined;
      expect(document && imageNodes(document)).toHaveLength(1);
    });

    const document = onChange.mock.calls.at(-1)?.[0] as V1RichContentDocument;
    expect(imageNodes(document)[0]).toEqual({
      type: 'image',
      attrs: {
        src: firstAsset.url,
        alt: 'match-photo',
        title: null,
        width: null,
        height: null,
        assetId: firstAsset.assetId,
      },
    });
  });

  it('uploads and inserts multiple supported images in selection order', async () => {
    const secondAsset = {
      assetId: '223e4567-e89b-42d3-a456-426614174000',
      url: '/uploads/2026/07/223e4567-e89b-42d3-a456-426614174000.png',
      status: 'temporary' as const,
    };
    const onChange = vi.fn();
    const onUploadImage = vi.fn()
      .mockResolvedValueOnce(firstAsset)
      .mockResolvedValueOnce(secondAsset);
    const { container } = render(
      <RichTextEditor value={EMPTY_RICH_CONTENT} onChange={onChange} onUploadImage={onUploadImage} />,
    );
    const webp = new File(['first'], 'first.webp', { type: 'image/webp' });
    const png = new File(['second'], 'second.png', { type: 'image/png' });

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [webp, png] } });

    await waitFor(() => expect(onUploadImage).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const document = onChange.mock.calls.at(-1)?.[0] as V1RichContentDocument | undefined;
      expect(document && imageNodes(document)).toHaveLength(2);
    });

    const images = imageNodes(onChange.mock.calls.at(-1)?.[0] as V1RichContentDocument);
    expect(images.map((image) => image.attrs?.assetId)).toEqual([firstAsset.assetId, secondAsset.assetId]);
    expect(images.map((image) => image.attrs?.alt)).toEqual(['first', 'second']);
  });

  it('ignores unsupported files without calling the upload API', async () => {
    const onChange = vi.fn();
    const onUploadImage = vi.fn();
    const { container } = render(
      <RichTextEditor value={EMPTY_RICH_CONTENT} onChange={onChange} onUploadImage={onUploadImage} />,
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['gif'], 'animated.gif', { type: 'image/gif' })] },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUploadImage).not.toHaveBeenCalled();
    const latest = onChange.mock.calls.at(-1)?.[0] as V1RichContentDocument | undefined;
    expect(latest ? imageNodes(latest) : []).toHaveLength(0);
  });

  it('shows the upload failure and does not insert a broken image node', async () => {
    const onChange = vi.fn();
    const onUploadImage = vi.fn().mockRejectedValue(new Error('Upload failed'));
    const { container } = render(
      <RichTextEditor value={EMPTY_RICH_CONTENT} onChange={onChange} onUploadImage={onUploadImage} />,
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['image'], 'failed.webp', { type: 'image/webp' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed');
    const latest = onChange.mock.calls.at(-1)?.[0] as V1RichContentDocument | undefined;
    expect(latest ? imageNodes(latest) : []).toHaveLength(0);
  });
});

describe('RichTextEditor 접근성 — 편집 영역에 이름이 붙는다', () => {
  // alpha 실측(2026-09-07): 툴바 버튼 18개는 전부 aria-label 이 있는데 정작 글을 쓰는
  // contenteditable 만 이름이 없어, 접근성 트리에 role=textbox·name="" 로 올라와 있었다.
  // 보이는 "본문" 라벨은 그냥 <span> 이라 연결돼 있지 않았다.
  const noop = { onChange: () => {}, onUploadImage: async () => firstAsset };

  // immediatelyRender: false 라 편집 영역은 마운트 직후가 아니라 이펙트 뒤에 붙는다.
  it('편집 영역의 접근 이름이 보이는 라벨과 같다', async () => {
    render(<RichTextEditor value={EMPTY_RICH_CONTENT} {...noop} />);

    // 이름으로 찾을 수 있다는 것 자체가 계약이다 — 못 찾으면 스크린리더도 못 읽는다.
    expect(await screen.findByRole('textbox', { name: '본문' })).toBeInTheDocument();
  });

  it('라벨을 바꾸면 편집 영역과 툴바 이름이 함께 따라간다', async () => {
    render(<RichTextEditor value={EMPTY_RICH_CONTENT} label="공지 내용" {...noop} />);

    expect(await screen.findByRole('textbox', { name: '공지 내용' })).toBeInTheDocument();
    // 툴바는 "본문 서식" 으로 고정돼 있어 label 을 바꿔도 따라오지 않았다.
    expect(screen.getByRole('toolbar', { name: '공지 내용 서식' })).toBeInTheDocument();
  });
});
