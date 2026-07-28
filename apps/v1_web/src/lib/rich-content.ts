import type { V1RichContentDocument, V1RichContentNode } from '@/types/api';

export const EMPTY_RICH_CONTENT: V1RichContentDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [] }],
};

export function plainTextToRichContent(body: string | null | undefined): V1RichContentDocument {
  const paragraphs = (body ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  return {
    type: 'doc',
    content: (paragraphs.length ? paragraphs : ['']).map((paragraph) => ({
      type: 'paragraph',
      content: paragraph.split('\n').flatMap((line, index) => [
        ...(index > 0 ? [{ type: 'hardBreak' } satisfies V1RichContentNode] : []),
        ...(line ? [{ type: 'text', text: line } satisfies V1RichContentNode] : []),
      ]),
    })),
  };
}

export function resolveRichContent(
  content: V1RichContentDocument | null | undefined,
  legacyBody?: string | null,
): V1RichContentDocument {
  return content?.type === 'doc' && Array.isArray(content.content)
    ? content
    : plainTextToRichContent(legacyBody);
}

export function richContentPlainText(content: V1RichContentDocument): string {
  const parts: string[] = [];
  const visit = (node: V1RichContentNode) => {
    if (node.type === 'text' && node.text) parts.push(node.text);
    if (node.type === 'hardBreak') parts.push('\n');
    node.content?.forEach(visit);
    if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type)) parts.push('\n');
  };
  visit(content);
  return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function richContentPreviewText(
  content: V1RichContentDocument | null | undefined,
  legacyBody: string | null | undefined,
  imageOnlyText = '이미지가 포함된 공지예요.',
): string {
  if (content?.type === 'doc' && Array.isArray(content.content)) {
    const text = richContentPlainText(content);
    if (text) return text;
    if (containsImage(content)) return imageOnlyText;
  }

  const body = legacyBody ?? '';
  const hadImageLabel = /\[이미지:[^\]]*\]/.test(body);
  const text = body
    .replace(/\r\n/g, '\n')
    .replace(/^[ \t]*\[이미지:[^\]]*\][ \t]*(?:\n|$)/gm, '')
    .replace(/\[이미지:[^\]]*\]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text || (hadImageLabel ? imageOnlyText : '');
}

export function isRichContentEmpty(content: V1RichContentDocument): boolean {
  return !richContentPlainText(content) && !containsImage(content);
}

function containsImage(node: V1RichContentNode): boolean {
  return node.type === 'image' || Boolean(node.content?.some(containsImage));
}
