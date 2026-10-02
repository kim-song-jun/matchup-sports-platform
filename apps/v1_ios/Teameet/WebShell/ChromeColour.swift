import UIKit

/// Reads the page's background colour so the shell can paint its own chrome to match.
///
/// Kept apart from the view controller because the parsing is the fragile half: the value
/// arrives as whatever string `getComputedStyle` produced, and a shell that misreads it
/// would paint the status bar band an arbitrary colour.
enum ChromeColour {

    /// `html` first, then `body` — a page that paints only on `body` leaves the root
    /// transparent, and a transparent answer tells the shell nothing.
    static let probeScript = """
    (function () {
      function solid(el) {
        if (!el) { return null; }
        var c = getComputedStyle(el).backgroundColor;
        return (!c || c === 'transparent' || /,\\s*0\\s*\\)$/.test(c)) ? null : c;
      }
      return solid(document.documentElement) || solid(document.body) || '';
    })()
    """

    /// Parses `rgb(r, g, b)` / `rgba(r, g, b, a)`. Returns `nil` for anything else so the
    /// caller keeps the colour it already had rather than guessing.
    static func parse(_ text: String?) -> UIColor? {
        guard let text, let open = text.firstIndex(of: "("), let close = text.lastIndex(of: ")") else {
            return nil
        }
        let numbers = text[text.index(after: open)..<close]
            .split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" })
            .compactMap { Double($0) }
        guard numbers.count >= 3 else { return nil }
        let alpha = numbers.count >= 4 ? numbers[3] : 1
        guard alpha > 0 else { return nil }
        return UIColor(
            red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255, alpha: alpha)
    }
}
