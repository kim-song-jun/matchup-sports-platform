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
 * 어느 네이티브 셸 안인지 — iOS 는 WKScriptMessageHandler(`window.webkit.messageHandlers.TeameetNative`)와
 * 함께 `window.TeameetNative` shim 도 붙이므로 iOS 를 먼저 본다. Android 는 `window.TeameetNative` 만 있다.
 */
export function detectNativeShell(): 'android' | 'ios' | null {
  if (typeof window === 'undefined') return null;
  const ios = (window as IosShellWindow).webkit?.messageHandlers?.TeameetNative;
  if (typeof ios?.postMessage === 'function') return 'ios';
  return typeof window.TeameetNative?.postMessage === 'function' ? 'android' : null;
}
