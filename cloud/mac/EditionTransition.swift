import SwiftUI

enum ConnectorEditionTransition {
    static var current: String { ConnectorDistribution.pomeAvailable ? "App Store" : "GitHub" }
    static func needsReview(defaults: UserDefaults = .standard) -> Bool {
        if let previous = defaults.string(forKey: "connector.reviewedEdition") { return previous != current }
        return defaults.bool(forKey: "stone.enabled") || ConnectorPage.connectors.contains { defaults.bool(forKey: "enabled." + $0.rawValue) }
    }
}

struct EditionTransitionView: View {
    @ObservedObject var model: ConnectorModel
    var body: some View {
        GroupBox("Your edition · " + ConnectorEditionTransition.current) {
            VStack(alignment: .leading, spacing: 14) {
                Text(ConnectorDistribution.pomeAvailable ? "This edition includes Pome, Eventz and DayFrame." : "This edition includes Eventz and DayFrame. " + ConnectorDistribution.pomeNotice)
                SetupStep(number: 1, title: "Replace the app, keep your setup", detail: "When moving from GitHub to the App Store, quit Connector first and install the App Store edition in Applications. Keep your Connector data; do not use an uninstaller that deletes settings. Run only one copy.") { EmptyView() }
                SetupStep(number: 2, title: "Review access on this Mac", detail: "macOS may ask again for access when the signing identity changes. Your selected vault or attachment folder may need to be selected again. Use the Fix button beside each red check below; allow only the access needed by apps you use.") { EmptyView() }
                SetupStep(number: 3, title: "Test your existing phone connections", detail: "Try your existing pairing before creating a new one. Read a note, load conversations, and check calendars or reminders on your device. Green Mac checks alone do not confirm delivery to your device. Set up Pome separately after moving to the App Store edition.") { EmptyView() }
                ForEach(model.visiblePages) { page in
                    ForEach(model.requirements(page).filter { !$0.ready }) { requirement in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(page.rawValue).font(.caption.weight(.semibold))
                            RequirementRow(requirement: requirement) { model.fix(page, requirement.id) }
                        }
                    }
                }
                Text("Edition switching is still being tested. Do not delete your existing configuration or regenerate working pairing details to resolve a permission error.").font(.callout).foregroundStyle(.secondary)
                if model.showEditionTransition {
                    Button("I’ve reviewed these steps") {
                        UserDefaults.standard.set(ConnectorEditionTransition.current, forKey: "connector.reviewedEdition")
                        model.showEditionTransition = false
                    }
                    Text("This dismisses the checklist from Overview. It remains available in Settings and does not mark any connection as working.").font(.caption).foregroundStyle(.secondary)
                }
            }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
