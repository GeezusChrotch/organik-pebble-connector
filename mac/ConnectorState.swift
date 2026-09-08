import Foundation

enum ConnectorPage: String, CaseIterable, Identifiable {
    case overview = "Overview", stone = "Notesy", beepster = "Beepster"
    case reminderz = "Reminderz", pome = "Pome", tesla = "Tesla", settings = "Settings"
    var id: String { rawValue }
    static var connectors: [Self] { [.stone, .beepster, .reminderz, .pome, .tesla] }
    var symbol: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .stone: return "note.text"
        case .beepster: return "bubble.left.and.bubble.right"
        case .reminderz: return "checklist"
        case .pome: return "house"
        case .tesla: return "car"
        case .settings: return "gearshape"
        }
    }
    var detail: String {
        switch self {
        case .stone: return "Dictate and read your Obsidian notes."
        case .beepster: return "Your Beeper conversations on your wrist."
        case .reminderz: return "Apple Reminders, a button press away."
        case .pome: return "Control your home through Itsyhome."
        case .tesla: return "Coming soon. Connect an existing personal Tesla gateway."
        default: return ""
        }
    }
}

struct ConnectorRequirement: Identifiable {
    let id: String
    let title: String
    let ready: Bool
    let detail: String
    let checking: Bool
    init(_ id: String, _ title: String, _ ready: Bool, _ detail: String, checking: Bool = false) {
        self.id = id; self.title = title; self.ready = ready; self.detail = detail
        self.checking = checking || (!ready && detail == "Not checked")
    }
    func pending(_ pending: Bool) -> Self { Self(id, title, ready, detail, checking: pending) }
}

enum ConnectorLabels {
    static var attachments: String {
#if APP_STORE
        "Attachment folder access"
#else
        "Full Disk Access for attachments"
#endif
    }
}

struct ConnectorVisibility {
    let defaults: UserDefaults
    func isVisible(_ page: ConnectorPage) -> Bool {
        guard ConnectorPage.connectors.contains(page) else { return true }
        let key = "visible." + page.rawValue
        return defaults.object(forKey: key) == nil ? page != .tesla : defaults.bool(forKey: key)
    }
    func setVisible(_ visible: Bool, for page: ConnectorPage) {
        defaults.set(visible, forKey: "visible." + page.rawValue)
    }
}
