import Foundation

enum KakaoSignInPolicy {
    static func additionalScopes(requested: [String], granted: [String]) -> [String] {
        var missing: [String] = []
        for scope in requested where scope.range(of: "^[a-z_]+$", options: .regularExpression) != nil {
            if !granted.contains(scope) && !missing.contains(scope) { missing.append(scope) }
        }
        return missing
    }
}
