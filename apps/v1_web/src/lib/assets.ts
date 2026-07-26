export function publicAssetPath(path: string) {
  return path;
}

export function cssUrl(path: string) {
  const escaped = publicAssetPath(path)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\d ')
    .replace(/\n/g, '\\a ')
    .replace(/\f/g, '\\c ');
  return `url("${escaped}")`;
}
