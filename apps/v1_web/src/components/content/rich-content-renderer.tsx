import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { publicAssetPath } from '@/lib/assets';
import { resolveRichContent } from '@/lib/rich-content';
import { isSafePopupLink } from '@/lib/popup-targets';
import type { V1RichContentDocument, V1RichContentMark, V1RichContentNode } from '@/types/api';

type RichContentRendererProps = {
  content?: V1RichContentDocument | null;
  legacyBody?: string | null;
  className?: string;
};

export function RichContentRenderer({ content, legacyBody, className = '' }: RichContentRendererProps) {
  const document = resolveRichContent(content, legacyBody);
  return (
    <div className={`tm-rich-content ${className}`.trim()}>
      {document.content?.map((node, index) => renderNode(node, `root-${index}`))}
    </div>
  );
}

function renderNode(node: V1RichContentNode, key: string): ReactNode {
  const children = node.content?.map((child, index) => renderNode(child, `${key}-${index}`));
  const style = node.attrs?.textAlign ? { textAlign: node.attrs.textAlign } : undefined;
  switch (node.type) {
    case 'text':
      return <span key={key}>{applyMarks(node.text ?? '', node.marks, key)}</span>;
    case 'paragraph':
      return <p key={key} style={style}>{children?.length ? children : <br />}</p>;
    case 'heading':
      return node.attrs?.level === 3
        ? <h3 key={key} style={style}>{children}</h3>
        : <h2 key={key} style={style}>{children}</h2>;
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return <ol key={key}>{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>;
    case 'horizontalRule':
      return <hr key={key} />;
    case 'hardBreak':
      return <br key={key} />;
    case 'image':
      return node.attrs?.src && node.attrs.alt ? (
        <figure key={key}>
          <Image
            src={publicAssetPath(node.attrs.src)}
            alt={node.attrs.alt}
            width={1200}
            height={800}
            sizes="(max-width: 640px) 100vw, 760px"
            unoptimized
          />
          {node.attrs.title ? <figcaption>{node.attrs.title}</figcaption> : null}
        </figure>
      ) : null;
    default:
      return null;
  }
}

function applyMarks(text: string, marks: V1RichContentMark[] | undefined, key: string): ReactNode {
  return (marks ?? []).reduce<ReactNode>((result, mark, index) => {
    const markKey = `${key}-mark-${index}`;
    switch (mark.type) {
      case 'bold': return <strong key={markKey}>{result}</strong>;
      case 'italic': return <em key={markKey}>{result}</em>;
      case 'underline': return <u key={markKey}>{result}</u>;
      case 'strike': return <s key={markKey}>{result}</s>;
      case 'link': {
        const href = mark.attrs?.href;
        if (!href || !isSafePopupLink(href)) return result;
        return href.toLowerCase().startsWith('https://')
          ? <a key={markKey} href={href} target="_blank" rel="noopener noreferrer nofollow">{result}</a>
          : <Link key={markKey} href={href}>{result}</Link>;
      }
      default: return result;
    }
  }, text);
}
