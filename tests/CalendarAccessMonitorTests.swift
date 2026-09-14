import Foundation

@main struct CalendarAccessMonitorTests {
    static func main() {
        var granted = false, visibleAuthorization = false, cachedCount = 0
        var resets = 0, reads = 0
        let monitor = CalendarAccessMonitor(authorization: { visibleAuthorization }, resetStore: {
            resets += 1
            visibleAuthorization = granted
            cachedCount = granted ? 4 : 0
        }, readCalendarCount: { reads += 1; return cachedCount })
        assert(monitor.check() == .init(authorized: false, calendarCount: nil))
        assert(reads == 0)
        // Same process/store: the grant callback clears a pre-grant empty cache.
        granted = true
        assert(monitor.check(afterGrant: true) == .init(authorized: true, calendarCount: 4))
        assert(resets == 1 && reads == 1)
        assert(monitor.check().calendarCount == 4 && resets == 1)
        // Settings revocation is observed even without a new permission callback.
        granted = false; visibleAuthorization = false
        assert(monitor.check() == .init(authorized: false, calendarCount: nil))
        assert(resets == 2 && reads == 2)
        // Regrant through Settings refreshes the same store before reading it.
        granted = true; visibleAuthorization = true
        assert(monitor.check().calendarCount == 4 && resets == 3)
        // A grant callback must not invent access while the system still denies it.
        var delayed = false, delayedReads = 0
        let lag = CalendarAccessMonitor(authorization: { delayed }, resetStore: {}, readCalendarCount: { delayedReads += 1; return 0 })
        assert(!lag.check(afterGrant: true).authorized && delayedReads == 0)
        delayed = true
        assert(lag.check() == .init(authorized: true, calendarCount: 0))
        // An authorized account with no calendars is valid, not a permission failure.
        assert(delayedReads == 1)
        print("PASS: same-store grant recovery, revocation, regrant, delayed status, empty calendar account")
    }
}
