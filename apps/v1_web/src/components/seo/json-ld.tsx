import { serializeJsonLd, type JsonLdNode } from '@/lib/structured-data';

/**
 * JSON-LD 구조화 데이터를 `<script type="application/ld+json">`으로 렌더한다.
 *
 * `dangerouslySetInnerHTML`을 쓰는 이유: JSON-LD는 script 태그 안에 **원문 그대로**
 * 들어가야 하고(HTML 엔티티로 이스케이프하면 파서가 읽지 못한다) React의 기본 텍스트
 * 렌더링은 `<`를 `&lt;`로 바꿔 버린다. 대신 `serializeJsonLd()`가 `<`를 `<`로
 * 치환해 `</script>` 조기 종료 XSS를 막는다 — JSON 파서는 이를 `<`로 되돌려 읽으므로
 * 구조화 데이터의 의미는 그대로다.
 */
export function JsonLd({ data }: { readonly data: JsonLdNode }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
