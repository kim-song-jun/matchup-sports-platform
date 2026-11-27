import Foundation

/// The REST period fields historically use ISO strings; ActivityKit/local snapshots use ms.
/// Optional endedAt is the server's first-ended observation, not a new clock on every decode.
enum WidgetMilliseconds {
    static func valid(_ value: Int64) -> Int64? {
        (0...253_402_300_799_999).contains(value) ? value : nil
    }
    static func decode<Key: CodingKey>(_ container: KeyedDecodingContainer<Key>, _ key: Key) throws -> Int64? {
        guard container.contains(key), try !container.decodeNil(forKey: key) else { return nil }
        if let value = try? container.decode(Int64.self, forKey: key) { return valid(value) }
        let string = try container.decode(String.self, forKey: key)
        return valid(WidgetFormat.parseDate(string))
    }
}
