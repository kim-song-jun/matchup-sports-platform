export function noticeSummary(body: string) {
  const summary = body
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return summary.length > 120 ? `${summary.slice(0, 120)}...` : summary;
}
