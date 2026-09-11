import Foundation

// Bound the work of each EventKit query without restricting navigation to today.
struct EventzQueryRange {
    let start: Date
    let end: Date
    init?(start: String, end: String) {
        guard let lower = Double(start), let upper = Double(end),
              lower.isFinite, upper.isFinite, lower >= -62135596800,
              upper <= 253402300800, upper > lower, upper - lower <= 32 * 86400 else { return nil }
        self.start = Date(timeIntervalSince1970: lower)
        self.end = Date(timeIntervalSince1970: upper)
    }
}
