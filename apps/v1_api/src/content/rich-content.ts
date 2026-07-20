import { BadRequestException } from '@nestjs/common';
import { isSafePopupLink } from '../popups/popup-screen';

export type RichContentMark = {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'link';
  attrs?: { href: string };
};

export type RichContentNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichContentNode[];
  text?: string;
  marks?: RichContentMark[];
};

export type RichContentDocument = {
  type: 'doc';
  content: RichContentNode[];
};

const MAX_SERIALIZED_BYTES = 100_000;
const MAX_NODES = 500;
const MAX_TEXT_LENGTH = 10_000;
const MAX_IMAGES = 10;
const BLOCK_NODES = new Set(['paragraph', 'heading', 'listItem', 'blockquote']);
const CONTAINER_NODES = new Set(['doc', 'bulletList', 'orderedList', 'listItem', 'blockquote']);
const LEAF_NODES = new Set(['text', 'hardBreak', 'horizontalRule', 'image']);
const ALLOWED_NODE_KEYS = new Set(['type', 'attrs', 'content', 'text', 'marks']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPLOAD_URL_PATTERN = /^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]+\.(?:jpe?g|png|webp)$/i;

export function plainTextToRichContent(body: string): RichContentDocument {
  const paragraphs = body.replace(/\r\n/g, '\n').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return {
    type: 'doc',
    content: (paragraphs.length ? paragraphs : ['']).map((paragraph) => ({
      type: 'paragraph',
      content: paragraph
        ? paragraph.split('\n').flatMap((line, index) => [
            ...(index > 0 ? [{ type: 'hardBreak' }] : []),
            ...(line ? [{ type: 'text', text: line }] : []),
          ])
        : [],
    })),
  };
}

export function normalizeRichContent(input: unknown, legacyBody?: string | null) {
  const candidate = input ?? plainTextToRichContent(legacyBody ?? '');
  let serialized: string;
  try {
    serialized = JSON.stringify(candidate);
  } catch {
    throw invalidContent('본문 문서 형식을 해석할 수 없어요.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES) {
    throw invalidContent('본문 데이터가 허용 크기를 초과했어요.');
  }
  if (!isRecord(candidate) || candidate.type !== 'doc' || !Array.isArray(candidate.content)) {
    throw invalidContent('본문은 Tiptap doc 형식이어야 해요.');
  }

  const document = normalizeEditorDefaults(candidate as RichContentDocument);
  const state = { nodeCount: 0, imageCount: 0, textLength: 0, textParts: [] as string[], assetRefs: new Map<string, string>() };
  validateNode(document, state, true);
  const plainText = state.textParts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!plainText) throw invalidContent('본문 내용을 입력해 주세요.');
  if (state.textLength > MAX_TEXT_LENGTH) throw invalidContent('본문 텍스트는 10,000자까지 입력할 수 있어요.');
  if (state.imageCount > MAX_IMAGES) throw invalidContent('본문 이미지는 최대 10개까지 사용할 수 있어요.');

  return {
    document,
    plainText,
    assets: [...state.assetRefs].map(([assetId, url]) => ({ assetId, url })),
  };
}

function validateNode(
  node: RichContentNode,
  state: { nodeCount: number; imageCount: number; textLength: number; textParts: string[]; assetRefs: Map<string, string> },
  root = false,
) {
  if (!isRecord(node) || typeof node.type !== 'string') throw invalidContent('본문 노드 형식이 올바르지 않아요.');
  for (const key of Object.keys(node)) {
    if (!ALLOWED_NODE_KEYS.has(key)) throw invalidContent(`허용되지 않은 본문 속성이에요: ${key}`);
  }
  state.nodeCount += 1;
  if (state.nodeCount > MAX_NODES) throw invalidContent('본문 구조가 너무 복잡해요.');

  if (root && node.type !== 'doc') throw invalidContent('본문 최상위 노드는 doc이어야 해요.');
  if (!root && node.type === 'doc') throw invalidContent('doc 노드는 본문 최상위에서만 사용할 수 있어요.');
  if (!CONTAINER_NODES.has(node.type) && !LEAF_NODES.has(node.type) && node.type !== 'paragraph' && node.type !== 'heading') {
    throw invalidContent(`허용되지 않은 본문 노드예요: ${node.type}`);
  }

  validateAttributes(node, state);

  if (node.type === 'text') {
    if (typeof node.text !== 'string' || !node.text) throw invalidContent('빈 텍스트 노드는 저장할 수 없어요.');
    if (node.content || node.attrs) throw invalidContent('텍스트 노드 구조가 올바르지 않아요.');
    validateMarks(node.marks);
    state.textLength += node.text.length;
    state.textParts.push(node.text);
    return;
  }
  if (node.marks || node.text !== undefined) throw invalidContent(`${node.type} 노드 구조가 올바르지 않아요.`);

  if (node.type === 'hardBreak') {
    if (node.content) throw invalidContent('줄바꿈 노드에는 하위 내용을 둘 수 없어요.');
    state.textParts.push('\n');
    return;
  }
  if (node.type === 'horizontalRule') {
    if (node.content) throw invalidContent('구분선 노드에는 하위 내용을 둘 수 없어요.');
    state.textParts.push('\n');
    return;
  }
  if (node.type === 'image') {
    if (node.content) throw invalidContent('이미지 노드에는 하위 내용을 둘 수 없어요.');
    return;
  }

  if (!Array.isArray(node.content)) throw invalidContent(`${node.type} 노드의 content 배열이 필요해요.`);
  for (const child of node.content) validateNode(child, state);
  if (BLOCK_NODES.has(node.type)) state.textParts.push('\n');
}

function validateAttributes(
  node: RichContentNode,
  state: { imageCount: number; textParts: string[]; assetRefs: Map<string, string> },
) {
  const attrs = node.attrs;
  if (node.type === 'paragraph') {
    validateTextAlignAttrs(attrs);
    return;
  }
  if (node.type === 'heading') {
    if (!isRecord(attrs) || ![2, 3].includes(Number(attrs.level))) throw invalidContent('제목은 2단계 또는 3단계만 사용할 수 있어요.');
    const { level: _level, ...alignment } = attrs;
    validateTextAlignAttrs(alignment);
    return;
  }
  if (node.type === 'orderedList') {
    if (attrs === undefined) return;
    if (!isRecord(attrs) || Object.keys(attrs).some((key) => key !== 'start') || !Number.isInteger(attrs.start) || Number(attrs.start) < 1 || Number(attrs.start) > 1000) {
      throw invalidContent('번호 목록 시작 값이 올바르지 않아요.');
    }
    return;
  }
  if (node.type === 'image') {
    if (!isRecord(attrs)) throw invalidContent('이미지 정보가 필요해요.');
    const allowed = new Set(['assetId', 'src', 'alt', 'title']);
    if (Object.keys(attrs).some((key) => !allowed.has(key))) throw invalidContent('이미지에 허용되지 않은 속성이 있어요.');
    const assetId = typeof attrs.assetId === 'string' ? attrs.assetId : '';
    const src = typeof attrs.src === 'string' ? attrs.src : '';
    const alt = typeof attrs.alt === 'string' ? attrs.alt.trim() : '';
    if (!UUID_PATTERN.test(assetId)) throw invalidContent('관리형 이미지 ID가 올바르지 않아요.');
    if (!UPLOAD_URL_PATTERN.test(src) || src.includes('\\')) throw invalidContent('이미지는 v1 업로드 URL만 사용할 수 있어요.');
    if (!alt || alt.length > 200) throw invalidContent('이미지 대체 텍스트를 1~200자로 입력해 주세요.');
    if (attrs.title !== undefined && (typeof attrs.title !== 'string' || attrs.title.length > 200)) throw invalidContent('이미지 제목이 너무 길어요.');
    state.imageCount += 1;
    const existingUrl = state.assetRefs.get(assetId);
    if (existingUrl && existingUrl !== src) throw invalidContent('같은 이미지 ID에 서로 다른 URL을 사용할 수 없어요.');
    state.assetRefs.set(assetId, src);
    state.textParts.push(`[이미지: ${alt}]\n`);
    return;
  }
  if (attrs !== undefined && Object.keys(attrs).length > 0) throw invalidContent(`${node.type} 노드에는 속성을 사용할 수 없어요.`);
}

function validateTextAlignAttrs(attrs: Record<string, unknown> | undefined) {
  if (attrs === undefined || Object.keys(attrs).length === 0) return;
  if (Object.keys(attrs).length === 1 && attrs.textAlign === null) return;
  if (Object.keys(attrs).some((key) => key !== 'textAlign') || !['left', 'center', 'right'].includes(String(attrs.textAlign))) {
    throw invalidContent('텍스트 정렬 값이 올바르지 않아요.');
  }
}

function normalizeEditorDefaults(document: RichContentDocument): RichContentDocument {
  const visit = (node: RichContentNode): RichContentNode => {
    if (!isRecord(node)) return node;
    const normalized: RichContentNode = { ...node };
    if ((node.type === 'paragraph' || node.type === 'heading') && node.content === undefined) {
      normalized.content = [];
    } else if (Array.isArray(node.content)) {
      normalized.content = node.content.map(visit);
    }
    if (Array.isArray(node.marks)) normalized.marks = node.marks.map(normalizeMarkDefaults);
    if (isRecord(node.attrs)) {
      const attrs = { ...node.attrs };
      if ((node.type === 'paragraph' || node.type === 'heading') && attrs.textAlign === null) delete attrs.textAlign;
      if (node.type === 'image') {
        if (attrs.title === null) delete attrs.title;
        if (attrs.width === null) delete attrs.width;
        if (attrs.height === null) delete attrs.height;
      }
      if (Object.keys(attrs).length) normalized.attrs = attrs;
      else delete normalized.attrs;
    }
    return normalized;
  };
  return visit(document) as RichContentDocument;
}

function normalizeMarkDefaults(mark: RichContentMark): RichContentMark {
  if (!isRecord(mark) || mark.type !== 'link' || !isRecord(mark.attrs)) return mark;
  const attrs: Record<string, unknown> = { ...mark.attrs };
  if (attrs.target === '_blank' || attrs.target === null) delete attrs.target;
  if (attrs.rel === 'noopener noreferrer nofollow' || attrs.rel === null) delete attrs.rel;
  if (attrs.class === null) delete attrs.class;
  if (attrs.title === null) delete attrs.title;
  return { ...mark, attrs } as RichContentMark;
}

function validateMarks(marks: RichContentMark[] | undefined) {
  if (marks === undefined) return;
  if (!Array.isArray(marks)) throw invalidContent('텍스트 서식 형식이 올바르지 않아요.');
  for (const mark of marks) {
    if (!isRecord(mark) || !['bold', 'italic', 'underline', 'strike', 'link'].includes(String(mark.type))) {
      throw invalidContent('허용되지 않은 텍스트 서식이에요.');
    }
    if (Object.keys(mark).some((key) => key !== 'type' && key !== 'attrs')) throw invalidContent('텍스트 서식 속성이 올바르지 않아요.');
    if (mark.type === 'link') {
      if (!isRecord(mark.attrs) || Object.keys(mark.attrs).some((key) => key !== 'href') || typeof mark.attrs.href !== 'string' || !isSafePopupLink(mark.attrs.href)) {
        throw invalidContent('링크는 내부 경로 또는 HTTPS 주소만 사용할 수 있어요.');
      }
    } else if (mark.attrs !== undefined && Object.keys(mark.attrs).length > 0) {
      throw invalidContent(`${mark.type} 서식에는 속성을 사용할 수 없어요.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidContent(message: string) {
  return new BadRequestException({ code: 'INVALID_RICH_CONTENT', message });
}
