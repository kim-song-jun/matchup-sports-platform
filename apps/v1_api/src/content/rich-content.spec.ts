import { BadRequestException } from '@nestjs/common';
import { normalizeRichContent, plainTextToRichContent } from './rich-content';

function managedImage(index: number, extension = 'webp') {
  const suffix = index.toString(16).padStart(12, '0');
  const assetId = `11111111-1111-4111-8111-${suffix}`;
  return {
    type: 'image',
    attrs: {
      assetId,
      src: `/uploads/2026/07/${assetId}.${extension}`,
      alt: `Managed image ${index}`,
    },
  };
}

describe('rich content contract', () => {
  it('upgrades legacy text while preserving authored line breaks', () => {
    const result = normalizeRichContent(undefined, '첫 줄\n둘째 줄\n\n다음 문단');
    expect(result.plainText).toBe('첫 줄\n둘째 줄\n다음 문단');
    expect(result.document).toEqual(plainTextToRichContent('첫 줄\n둘째 줄\n\n다음 문단'));
  });

  it('accepts safe links and managed images', () => {
    const result = normalizeRichContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '매치 보기', marks: [{ type: 'link', attrs: { href: '/matches' } }] }] },
        { type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp', alt: '경기 안내 이미지' } },
      ],
    });
    expect(result.assets).toEqual([{
      assetId: '11111111-1111-4111-8111-111111111111',
      url: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp',
    }]);
    expect(result.plainText).toContain('경기 안내 이미지');
  });

  it('accepts Tiptap default null alignment and omits it from canonical JSON', () => {
    const result = normalizeRichContent({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'Default alignment' }] },
        { type: 'heading', attrs: { level: 2, textAlign: null }, content: [{ type: 'text', text: 'Heading' }] },
      ],
    });

    expect(result.document).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Default alignment' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
      ],
    });
  });

  it('still rejects unsupported text alignment values', () => {
    expect(() => normalizeRichContent({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'justify' }, content: [{ type: 'text', text: 'Invalid alignment' }] }],
    })).toThrow(BadRequestException);
  });

  it('accepts Tiptap image null defaults and omits them from canonical JSON', () => {
    const result = normalizeRichContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Image' }] },
        {
          type: 'image',
          attrs: {
            assetId: '11111111-1111-4111-8111-111111111111',
            src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp',
            alt: 'Managed image',
            title: null,
            width: null,
            height: null,
          },
        },
      ],
    });

    expect(result.document.content[1].attrs).toEqual({
      assetId: '11111111-1111-4111-8111-111111111111',
      src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp',
      alt: 'Managed image',
    });
  });

  it.each(['jpg', 'jpeg', 'png', 'webp'])('accepts a managed %s image URL', (extension) => {
    const image = managedImage(1, extension);
    const result = normalizeRichContent({ type: 'doc', content: [image] });

    expect(result.assets).toEqual([{
      assetId: image.attrs.assetId,
      url: image.attrs.src,
    }]);
    expect(result.plainText).toContain(image.attrs.alt);
  });

  it('accepts exactly 10 managed images and rejects the 11th', () => {
    const tenImages = Array.from({ length: 10 }, (_, index) => managedImage(index + 1));
    expect(normalizeRichContent({ type: 'doc', content: tenImages }).assets).toHaveLength(10);

    const elevenImages = [...tenImages, managedImage(11)];
    expect(() => normalizeRichContent({ type: 'doc', content: elevenImages })).toThrow(BadRequestException);
  });

  it('accepts Tiptap empty text blocks and canonicalizes their missing content', () => {
    const result = normalizeRichContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Visible content' }] },
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 } },
      ],
    });

    expect(result.document.content[1]).toEqual({ type: 'paragraph', content: [] });
    expect(result.document.content[2]).toEqual({ type: 'heading', attrs: { level: 2 }, content: [] });
  });

  it('omits Tiptap link presentation defaults from canonical JSON', () => {
    const result = normalizeRichContent({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Link',
          marks: [{
            type: 'link',
            attrs: {
              href: '/matches',
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
              class: null,
              title: null,
            },
          }],
        }],
      }],
    });

    expect(result.document.content[0].content?.[0].marks).toEqual([
      { type: 'link', attrs: { href: '/matches' } },
    ]);
  });

  it.each([
    { type: 'doc', content: [null] },
    { type: 'doc', content: [{ type: 'paragraph', content: null }] },
    { type: 'doc', content: [{ type: 'html', attrs: { value: '<script>alert(1)</script>' } }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '위험', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target', marks: [{ type: 'link', attrs: { href: '/matches', target: '_self' } }] }] }] },
    { type: 'doc', content: [{ type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: 'data:image/png;base64,abc', alt: '위험 이미지' } }] },
    { type: 'doc', content: [{ type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: 'https://example.com/a.png', alt: '외부 이미지' } }] },
    { type: 'doc', content: [{ type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp', alt: 'Sized image', width: 320 } }] },
    { type: 'doc', content: [{ type: 'image', attrs: { assetId: 'not-a-uuid', src: '/uploads/2026/07/not-a-uuid.webp', alt: 'Invalid id' } }] },
    { type: 'doc', content: [{ type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp', alt: '   ' } }] },
    { type: 'doc', content: [{ type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp', alt: 'Unknown attr', loading: 'lazy' } }] },
    {
      type: 'doc',
      content: [
        { type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.webp', alt: 'First URL' } },
        { type: 'image', attrs: { assetId: '11111111-1111-4111-8111-111111111111', src: '/uploads/2026/07/11111111-1111-4111-8111-111111111111.png', alt: 'Second URL' } },
      ],
    },
  ])('rejects unsafe or unsupported documents', (document) => {
    expect(() => normalizeRichContent(document)).toThrow(BadRequestException);
  });
});
