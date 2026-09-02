import Foundation

/// Keeps the page at 1:1 inside the shell: no pinch, no double-tap, and — the one readers
/// actually run into — no automatic zoom when a text field takes focus.
///
/// WebKit zooms the page in whenever a focused control's font is smaller than 16px, and the
/// web app's fields are 15px (`.tm-input` in `globals.css`). Safari ignores viewport scale
/// limits, so nothing on the page can stop it there; `WKWebView` honours them
/// (`ignoresViewportScaleLimits` defaults to false), so `maximum-scale=1` in the viewport
/// meta is enough — and it takes effect only inside this shell. The web app's own viewport,
/// and browser accessibility zoom, stay exactly as they are. Android's `WebView` never
/// zooms on focus, so this is what brings the two shells level.
///
/// A script rather than a change to the web's `<meta>`, because React owns that tag: Next.js
/// renders the viewport, and a client-side navigation can render it again with the page's own
/// value. The script rewrites the tag whenever it appears or changes, and rewrites only the
/// two scale properties — `width=device-width, initial-scale=1` are kept exactly as the page
/// declared them. It must never add `viewport-fit=cover`: the safe-area contract relies on
/// `env(safe-area-inset-bottom)` staying 0 inside the shell (see `SafeAreaBridge`).
enum ViewportLock {

    /// The pure half, kept separate so it can be run under JavaScriptCore in a unit test:
    /// given a viewport `content`, returns the same declaration with the scale locked.
    ///
    /// Existing `maximum-scale` / `user-scalable` entries are dropped and the locked pair is
    /// appended; every other property is passed through untouched. A page that declares no
    /// viewport at all gets the mobile default — without `width=device-width` WebKit would
    /// lay the page out at desktop width, which is a different bug, not a locked one.
    static let rewriteFunction = """
    function lockedViewportContent(content) {
      var LOCKED = [['maximum-scale', '1'], ['user-scalable', 'no']];
      var kept = [];
      var seen = {};
      String(content || '').split(',').forEach(function (part) {
        var trimmed = part.trim();
        if (!trimmed) { return; }
        var key = trimmed.split('=')[0].trim().toLowerCase();
        var isLocked = LOCKED.some(function (pair) { return pair[0] === key; });
        if (isLocked || seen[key]) { return; }
        seen[key] = true;
        kept.push(trimmed);
      });
      if (kept.length === 0) { kept = ['width=device-width', 'initial-scale=1']; }
      return kept.concat(LOCKED.map(function (pair) { return pair.join('='); })).join(', ');
    }
    """

    /// Injected at document end, main frame only. `document.head` exists by then and so does
    /// the server-rendered meta; the observer covers everything React does afterwards. Setting
    /// an already-locked value is skipped, so the observer cannot feed itself.
    static let script = """
    (function () {
      \(rewriteFunction)
      function lock() {
        var head = document.head;
        if (!head) { return; }
        var metas = head.querySelectorAll('meta[name="viewport"]');
        if (metas.length === 0) {
          var meta = document.createElement('meta');
          meta.setAttribute('name', 'viewport');
          meta.setAttribute('content', lockedViewportContent(''));
          head.appendChild(meta);
          return;
        }
        for (var i = 0; i < metas.length; i += 1) {
          var next = lockedViewportContent(metas[i].getAttribute('content'));
          if (metas[i].getAttribute('content') !== next) { metas[i].setAttribute('content', next); }
        }
      }
      lock();
      if (document.head) {
        new MutationObserver(lock).observe(document.head, {
          childList: true, subtree: true, attributes: true, attributeFilter: ['content']
        });
      }
    })();
    """
}
