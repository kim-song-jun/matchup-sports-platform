import Foundation

/// Publishes the device's bottom inset to the web page as a CSS variable.
///
/// This is not optional decoration — without it the v1 web app has no bottom inset at all
/// on iOS. `apps/v1_web` declares no `viewport-fit=cover` anywhere (measured: zero
/// occurrences in the whole app), so `env(safe-area-inset-bottom)` evaluates to `0` inside
/// `WKWebView`. The page's own definition is
///
/// ```css
/// --v1-shell-safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--teameet-native-safe-bottom));
/// ```
///
/// which therefore collapses to whatever the shell writes here. Eleven files consume that
/// variable, including `.tm-app-frame-no-bottom .tm-scroll-area` — every detail and form
/// screen without a bottom nav. Skip the injection and all of them sit under the home
/// indicator.
///
/// Both variables are written, matching Android. Setting `--v1-shell-safe-bottom` directly
/// as well keeps the shell correct against a deployed web build whose CSS predates the
/// `max()` definition.
enum SafeAreaBridge {

    static let nativeVariable = "--teameet-native-safe-bottom"
    static let shellVariable = "--v1-shell-safe-bottom"

    /// A `WKWebView` renders at `initial-scale=1` with `width=device-width`, so one CSS
    /// pixel is one point and the inset needs no density division — unlike Android, which
    /// divides by `displayMetrics.density`.
    static func script(bottomInsetPoints: Double) -> String {
        let pixels = Int(bottomInsetPoints.rounded())
        let value = "\(max(0, pixels))px"
        return """
        document.documentElement.style.setProperty('\(nativeVariable)','\(value)');\
        document.documentElement.style.setProperty('\(shellVariable)','\(value)')
        """
    }

    /// Reads both variables back out of the page. The shell uses this to prove the value it
    /// injected is the value the page resolved, rather than trusting that the write landed.
    static let readbackScript = """
    (function () {
      var s = getComputedStyle(document.documentElement);
      return JSON.stringify({
        native: s.getPropertyValue('\(nativeVariable)').trim(),
        shell: s.getPropertyValue('\(shellVariable)').trim()
      });
    })()
    """
}
