import AppKit
import Foundation

@main struct UpdaterTests {
    @MainActor static func main() {
        _ = NSApplication.shared
        let domain = Bundle.main.bundleIdentifier!
        precondition(domain.hasSuffix(".updater-tests"))
        let defaults = UserDefaults.standard
        defer { defaults.removePersistentDomain(forName: domain) }
        let updater = ConnectorUpdater()
        // Startup must initialize Sparkle without requesting a network check.
        updater.automatic = false
        updater.intervalHours = 6
        updater.start()
        RunLoop.main.run(until: Date().addingTimeInterval(0.5))
        precondition(updater.canCheck, updater.status)
        precondition(updater.status == "Ready to check for updates.")
        precondition(defaults.bool(forKey: "SUEnableAutomaticChecks") == false)
        precondition(defaults.double(forKey: "SUScheduledCheckInterval") == 21600)
        updater.intervalHours = 48
        precondition(defaults.double(forKey: "SUScheduledCheckInterval") == 172800)
        let reloaded = ConnectorUpdater()
        precondition(reloaded.intervalHours == 48 && !reloaded.automatic)
        print("PASS: Sparkle starts, manual check is available, interval reaches scheduler, preferences persist")
    }
}
