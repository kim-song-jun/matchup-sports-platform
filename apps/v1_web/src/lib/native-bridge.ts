/**
 * The one description of the global the native shells install.
 *
 * It lived in `native-push.ts` and again in `native-apple.ts`, and TypeScript merges two
 * `declare global` blocks only when the property types are spelled identically — so the
 * moment one of them grew a field, the other declaration won and the field was invisible
 * (`Property 'supports' does not exist`). One declaration, imported by both.
 */

export interface TeameetNativeBridge {
  postMessage(message: string): void;
  /**
   * The actions this shell can answer. Only the iOS shell sets it.
   *
   * Finding the global is not the same as finding a feature: Android installs one with this
   * same name through `addWebMessageListener`, and it answers push actions only. Anything
   * shell-only has to be offered on this list, never on the global's presence — an older iOS
   * build is covered by the same rule, since it advertises the actions it actually has.
   */
  supports?: readonly string[];
}

declare global {
  interface Window {
    TeameetNative?: TeameetNativeBridge;
  }
}

type IosShellWindow = Window & {
  webkit?: { messageHandlers?: { TeameetNative?: { postMessage(message: unknown): void } } };
};

/**
 * 어느 네이티브 셸 안인지 — Android 는 `window.TeameetNative`, iOS 는 WKScriptMessageHandler 로
 * `window.webkit.messageHandlers.TeameetNative` 를 붙인다. 둘 다 없으면 브라우저다.
 */
export function detectNativeShell(): 'android' | 'ios' | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.TeameetNative?.postMessage === 'function') return 'android';
  const ios = (window as IosShellWindow).webkit?.messageHandlers?.TeameetNative;
  return typeof ios?.postMessage === 'function' ? 'ios' : null;
}
