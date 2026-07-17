export function publicAssetPath(path: string) {
  return path;
}

export function cssUrl(path: string) {
  return `url("${publicAssetPath(path).replace(/"/g, '\\"')}")`;
}
