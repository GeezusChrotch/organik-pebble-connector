import Foundation

/// Called on the main queue, alongside the EventKit reads performed by Eventz.
/// Reset affects this app's EventKit cache, never macOS privacy grants.
final class CalendarAccessMonitor {
    struct Result: Equatable {
        let authorized: Bool
        let calendarCount: Int?
    }
    private let authorization: () -> Bool
    private let resetStore: () -> Void
    private let readCalendarCount: () -> Int
    private var previousAuthorization: Bool?

    init(authorization: @escaping () -> Bool, resetStore: @escaping () -> Void,
         readCalendarCount: @escaping () -> Int) {
        self.authorization = authorization
        self.resetStore = resetStore
        self.readCalendarCount = readCalendarCount
    }
    func check(afterGrant: Bool = false) -> Result {
        let before = authorization()
        let changed = previousAuthorization != nil && previousAuthorization != before
        previousAuthorization = before
        if afterGrant || changed { resetStore() }
        let allowed = authorization()
        previousAuthorization = allowed
        // Never serve a previously cached calendar count after access is lost.
        return Result(authorized: allowed, calendarCount: allowed ? readCalendarCount() : nil)
    }
}
