import Foundation

@main struct ConnectorStateTests {
    static func main() {
        let suite = "org.organikapps.visibility-tests." + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let preferences = ConnectorVisibility(defaults: defaults)
        assert(ConnectorPage.connectors.map(\.rawValue) == ["Notesy", "Beepster", "Reminderz", "Pome", "Tesla"])
        assert(!preferences.isVisible(.tesla))
        assert(preferences.isVisible(.stone))
        // Migration from a personal build does not automatically expose Tesla.
        defaults.set(true, forKey: "enabled.Tesla")
        assert(!preferences.isVisible(.tesla))
        defaults.set(true, forKey: "stone.enabled")
        defaults.set("pairing-is-preserved", forKey: "stone.testPairing")
        preferences.setVisible(false, for: .stone)
        let reloaded = ConnectorVisibility(defaults: UserDefaults(suiteName: suite)!)
        assert(!reloaded.isVisible(.stone))
        assert(defaults.bool(forKey: "stone.enabled"))
        assert(defaults.string(forKey: "stone.testPairing") == "pairing-is-preserved")
        preferences.setVisible(true, for: .tesla)
        assert(reloaded.isVisible(.tesla))
        for page in ConnectorPage.connectors { preferences.setVisible(false, for: page) }
        assert(ConnectorPage.connectors.filter { reloaded.isVisible($0) }.isEmpty)
        assert(reloaded.isVisible(.settings) && reloaded.isVisible(.overview))
        print("PASS: visibility defaults, migration, persistence, hidden services, and navigation")
    }
}
