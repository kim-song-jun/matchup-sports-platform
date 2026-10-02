import { richContentPreviewText } from '@/lib/rich-content';
import type { V1RichContentDocument } from '@/types/api';

export function noticeSummary(body: string, content?: V1RichContentDocument | null) {
  const summary = richContentPreviewText(content, body)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return summary.length > 120 ? `${summary.slice(0, 120)}...` : summary;
}
