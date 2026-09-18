import XCTest

/// Parsing the page's background colour.
///
/// The value arrives as whatever string `getComputedStyle` produced, and the shell paints
/// the band above the page with it. Misreading it puts an arbitrary colour under the status
/// bar, so every shape the browser can return is pinned here — and anything unrecognised
/// must return `nil` so the caller keeps the colour it already had.
final class ChromeColourTests: XCTestCase {

    /// Rounded to three places: the parser divides by 255, so exact equality would compare
    /// binary floating point.
    private func components(_ colour: UIColor?) -> [Double]? {
        guard let colour else { return nil }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard colour.getRed(&r, green: &g, blue: &b, alpha: &a) else { return nil }
        var out: [Double] = []
        for value in [r, g, b, a] {
            out.append((Double(value) * 1000).rounded() / 1000)
        }
        return out
    }

    private func expected(_ r: Double, _ g: Double, _ b: Double, _ a: Double) -> [Double] {
        var out: [Double] = []
        for value in [r / 255, g / 255, b / 255, a] {
            out.append((value * 1000).rounded() / 1000)
        }
        return out
    }

    func testParsesTheShapeBrowsersReturn() {
        XCTAssertEqual(components(ChromeColour.parse("rgb(255, 255, 255)")), expected(255, 255, 255, 1))
        XCTAssertEqual(components(ChromeColour.parse("rgb(17, 24, 39)")), expected(17, 24, 39, 1))
    }

    func testParsesAnAlphaChannel() {
        XCTAssertEqual(components(ChromeColour.parse("rgba(0, 0, 0, 0.5)")), expected(0, 0, 0, 0.5))
    }

    /// Newer engines emit `rgb(255 255 255 / 0.5)`.
    func testParsesTheSpaceSeparatedForm() {
        XCTAssertEqual(components(ChromeColour.parse("rgb(255 255 255 / 0.5)")), expected(255, 255, 255, 0.5))
    }

    /// A fully transparent answer says nothing about what the reader sees, so it must not be
    /// painted — the band would go clear and show whatever is behind it.
    func testRejectsATransparentColour() {
        XCTAssertNil(ChromeColour.parse("rgba(0, 0, 0, 0)"))
    }

    func testRejectsAnythingItCannotRead() {
        for text in ["", "transparent", "white", "#ffffff", "rgb()", "rgb(1, 2)", "not a colour"] {
            XCTAssertNil(ChromeColour.parse(text), "'\(text)' must not be painted")
        }
        XCTAssertNil(ChromeColour.parse(nil))
    }
}
