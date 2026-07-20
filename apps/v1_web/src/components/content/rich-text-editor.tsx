'use client';

import FileHandler from '@tiptap/extension-file-handler';
import ImageExtension from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, mergeAttributes, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { resolveRichContent } from '@/lib/rich-content';
import { publicAssetPath } from '@/lib/assets';
import type { V1AdminContentAsset, V1RichContentDocument } from '@/types/api';

const ManagedImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: { default: null, rendered: false },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        src: publicAssetPath(String(HTMLAttributes.src ?? '')),
      }),
    ];
  },
});

type RichTextEditorProps = {
  value: V1RichContentDocument;
  onChange: (value: V1RichContentDocument) => void;
  onUploadImage: (file: File) => Promise<V1AdminContentAsset>;
  disabled?: boolean;
  label?: string;
};

export function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  disabled = false,
  label = '본문',
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef(onUploadImage);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  uploadRef.current = onUploadImage;

  const insertFiles = async (editor: Editor, files: File[], position?: number) => {
    const imageFiles = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (!imageFiles.length) return;
    setUploading(true);
    setUploadError('');
    try {
      const images = [];
      for (const file of imageFiles) {
        const asset = await uploadRef.current(file);
        images.push({
          type: 'image',
          attrs: {
            assetId: asset.assetId,
            src: asset.url,
            alt: file.name.replace(/\.[^.]+$/, '') || '공지 이미지',
            title: null,
          },
        });
      }
      const chain = position === undefined ? editor.chain().focus() : editor.chain().focus().setTextSelection(position);
      chain.insertContent(images).run();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '이미지를 업로드하지 못했어요.');
    } finally {
      setUploading(false);
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ['https'],
          HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
        },
      }),
      ManagedImage.configure({ allowBase64: false, HTMLAttributes: { class: 'tm-rich-editor-image' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
      FileHandler.configure({
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        consumePasteEvent: true,
        onPaste: (instance, files) => void insertFiles(instance, files),
        onDrop: (instance, files, position) => void insertFiles(instance, files, position),
      }),
    ],
    content: value,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON() as V1RichContentDocument),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(resolveRichContent(value));
    if (JSON.stringify(editor.getJSON()) !== incoming) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance?.isActive('bold') ?? false,
      italic: instance?.isActive('italic') ?? false,
      underline: instance?.isActive('underline') ?? false,
      strike: instance?.isActive('strike') ?? false,
      heading2: instance?.isActive('heading', { level: 2 }) ?? false,
      heading3: instance?.isActive('heading', { level: 3 }) ?? false,
      bulletList: instance?.isActive('bulletList') ?? false,
      orderedList: instance?.isActive('orderedList') ?? false,
      blockquote: instance?.isActive('blockquote') ?? false,
      left: instance?.isActive({ textAlign: 'left' }) ?? false,
      center: instance?.isActive({ textAlign: 'center' }) ?? false,
      right: instance?.isActive({ textAlign: 'right' }) ?? false,
    }),
  });

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('링크 주소를 입력해 주세요. 내부 경로(/...) 또는 https:// 주소만 사용할 수 있어요.', previous ?? '');
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!(href.startsWith('/') && !href.startsWith('//')) && !href.startsWith('https://')) {
      setUploadError('링크는 내부 경로(/...) 또는 https:// 주소만 사용할 수 있어요.');
      return;
    }
    setUploadError('');
    editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[var(--font-size-label)] font-semibold text-gray-700">{label}</span>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
        <div className="flex flex-wrap gap-1 border-b border-gray-100 bg-gray-50 p-2" role="toolbar" aria-label="본문 서식">
          <ToolbarButton label="실행 취소" onClick={() => editor?.chain().focus().undo().run()} disabled={disabled || !editor?.can().undo()}><Undo2 /></ToolbarButton>
          <ToolbarButton label="다시 실행" onClick={() => editor?.chain().focus().redo().run()} disabled={disabled || !editor?.can().redo()}><Redo2 /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="굵게" active={state?.bold} onClick={() => editor?.chain().focus().toggleBold().run()} disabled={disabled}><Bold /></ToolbarButton>
          <ToolbarButton label="기울임" active={state?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={disabled}><Italic /></ToolbarButton>
          <ToolbarButton label="밑줄" active={state?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()} disabled={disabled}><Underline /></ToolbarButton>
          <ToolbarButton label="취소선" active={state?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()} disabled={disabled}><Strikethrough /></ToolbarButton>
          <ToolbarButton label="링크" onClick={setLink} disabled={disabled}><LinkIcon /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="제목 2" active={state?.heading2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} disabled={disabled}><Heading2 /></ToolbarButton>
          <ToolbarButton label="제목 3" active={state?.heading3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} disabled={disabled}><Heading3 /></ToolbarButton>
          <ToolbarButton label="글머리 목록" active={state?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()} disabled={disabled}><List /></ToolbarButton>
          <ToolbarButton label="번호 목록" active={state?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()} disabled={disabled}><ListOrdered /></ToolbarButton>
          <ToolbarButton label="인용" active={state?.blockquote} onClick={() => editor?.chain().focus().toggleBlockquote().run()} disabled={disabled}><Quote /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="왼쪽 정렬" active={state?.left} onClick={() => editor?.chain().focus().setTextAlign('left').run()} disabled={disabled}><AlignLeft /></ToolbarButton>
          <ToolbarButton label="가운데 정렬" active={state?.center} onClick={() => editor?.chain().focus().setTextAlign('center').run()} disabled={disabled}><AlignCenter /></ToolbarButton>
          <ToolbarButton label="오른쪽 정렬" active={state?.right} onClick={() => editor?.chain().focus().setTextAlign('right').run()} disabled={disabled}><AlignRight /></ToolbarButton>
          <ToolbarButton label="이미지 추가" onClick={() => fileInputRef.current?.click()} disabled={disabled || uploading}><ImagePlus /></ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files && editor) void insertFiles(editor, Array.from(event.target.files));
              event.target.value = '';
            }}
          />
        </div>
        <EditorContent editor={editor} className="tm-rich-editor" />
      </div>
      <p className={`text-xs ${uploadError ? 'text-red-600' : 'text-gray-500'}`} role={uploadError ? 'alert' : undefined}>
        {uploadError || (uploading ? '이미지를 업로드하고 있어요…' : 'JPG, PNG, WebP · 파일당 최대 5MB · 최대 10개')}
      </p>
    </div>
  );
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors [&_svg]:h-4 [&_svg]:w-4 ${active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-white hover:text-gray-900'} disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-9 w-px bg-gray-200" aria-hidden="true" />;
}
