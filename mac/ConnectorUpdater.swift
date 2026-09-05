import Foundation
import Combine
import Sparkle

@MainActor final class ConnectorUpdater: ObservableObject {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Development"
    @Published var canCheck = false
    @Published var status = "Update feed is not configured for this build."
    @Published var automatic = UserDefaults.standard.object(forKey: "SUEnableAutomaticChecks") as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(automatic, forKey: "SUEnableAutomaticChecks")
            controller?.updater.automaticallyChecksForUpdates = automatic
        }
    }
    @Published var intervalHours = min(168, max(1, UserDefaults.standard.object(forKey: "updates.intervalHours") as? Int ?? 24)) {
        didSet {
            UserDefaults.standard.set(intervalHours, forKey: "updates.intervalHours")
            controller?.updater.updateCheckInterval = Double(intervalHours) * 3600
        }
    }
    private var controller: SPUStandardUpdaterController?
    private var subscriptions = Set<AnyCancellable>()
    func start() {
        guard controller == nil,
              let feed = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String,
              let url = URL(string: feed), url.scheme == "https", url.host != nil,
              let key = Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String,
              Data(base64Encoded: key)?.count == 32 else { return }
        let controller = SPUStandardUpdaterController(startingUpdater: false, updaterDelegate: nil, userDriverDelegate: nil)
        self.controller = controller
        controller.updater.automaticallyChecksForUpdates = automatic
        controller.updater.updateCheckInterval = Double(intervalHours) * 3600
        controller.updater.publisher(for: \.canCheckForUpdates).receive(on: RunLoop.main).assign(to: &$canCheck)
        controller.updater.publisher(for: \.lastUpdateCheckDate).receive(on: RunLoop.main).sink { [weak self] date in
            self?.status = date.map { "Last checked: " + $0.formatted(date: .abbreviated, time: .shortened) } ?? "Ready to check for updates."
        }.store(in: &subscriptions)
        do { try controller.updater.start() }
        catch { status = "Updates could not start: " + error.localizedDescription; canCheck = false }
    }
    func check() { controller?.checkForUpdates(nil) }
}
