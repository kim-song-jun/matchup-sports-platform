import XCTest

/// The rules that protect iOS's single permission dialog.
final class PushPromptPolicyTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func shouldPrompt(
        _ permission: PushPermission.WebValue = .notDetermined,
        signedIn: Bool = true,
        state: PushPromptPolicy.State = .init(),
        at date: Date? = nil
    ) -> Bool {
        PushPromptPolicy.shouldPrompt(
            permission: permission, signedIn: signedIn, state: state, now: date ?? now)
    }

    func testAsksASignedInReaderWhoHasNotBeenAsked() {
        XCTAssertTrue(shouldPrompt())
    }

    /// The reason the explainer exists. Asking a signed-out reader spends the one dialog on
    /// someone with no account to attach a token to.
    func testDoesNotAskBeforeSignIn() {
        XCTAssertFalse(shouldPrompt(signedIn: false))
    }

    /// Once the system has an answer its dialog will not appear again, so an explainer in
    /// front of it explains nothing.
    func testDoesNotAskOnceTheSystemHasAnAnswer() {
        XCTAssertFalse(shouldPrompt(.granted))
        XCTAssertFalse(shouldPrompt(.denied))
    }

    func testDoesNotAskAgainAfterTheReaderAccepted() {
        XCTAssertFalse(shouldPrompt(state: .init(accepted: true)))
    }

    /// "나중에" is not "no" — but it is not "ask me on every launch" either.
    func testWaitsAfterADeferralAndAsksOnceTheWaitIsOver() {
        let state = PushPromptPolicy.State(deferrals: 1, lastDeferredAt: now)
        let wait = PushPromptPolicy.backoff(afterDeferrals: 1)
        XCTAssertFalse(shouldPrompt(state: state, at: now.addingTimeInterval(wait - 1)))
        XCTAssertTrue(shouldPrompt(state: state, at: now.addingTimeInterval(wait)))
    }

    func testTheWaitGrowsWithEachDeferral() {
        let first = PushPromptPolicy.backoff(afterDeferrals: 1)
        let second = PushPromptPolicy.backoff(afterDeferrals: 2)
        let third = PushPromptPolicy.backoff(afterDeferrals: 3)
        XCTAssertLessThan(first, second)
        XCTAssertLessThan(second, third)
    }

    /// Three "나중에" is an answer. The settings screen remains for anyone who changes their
    /// mind, so stopping here loses nothing.
    func testStopsAskingAfterTheDeferralLimit() {
        let long = now.addingTimeInterval(-365 * 24 * 60 * 60)
        let state = PushPromptPolicy.State(
            deferrals: PushPromptPolicy.maximumDeferrals, lastDeferredAt: long)
        XCTAssertFalse(shouldPrompt(state: state))
    }
}
