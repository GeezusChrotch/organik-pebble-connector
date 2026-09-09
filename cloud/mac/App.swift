import AppKit
import SwiftUI
import Combine
import ServiceManagement

@MainActor final class ConnectorModel: ObservableObject {
    let stone = NotesyService()
    let cameras = PomeCameraService()
    // Visibility never starts or stops the existing personal gateway.
    let tesla = ExternalService(name: "Tesla", description: "Use your existing Tesla gateway. Developer registration, Tesla sign-in, and the command proxy are managed by that gateway.", localPort: 8793, privatePort: 10449, healthPath: "/health")
    let updater = ConnectorUpdater()
    @Published var selection: ConnectorPage? = .overview
    @Published var menuBarMode = UserDefaults.standard.bool(forKey: "menuBarMode") {
        didSet { UserDefaults.standard.set(menuBarMode, forKey: "menuBarMode") }
    }
    @Published var beepster: BeepsterModule?
    @Published var reminderz: ReminderzModule?
    @Published var visiblePages = ConnectorPage.connectors.filter { ConnectorVisibility(defaults: .standard).isVisible($0) }
    private var legacyViews: [ConnectorPage: NSView] = [:]
    private var subscriptions = Set<AnyCancellable>()
    private var timer: Timer?
    private var refreshing = false
    func start() {
        for notification in [NSWindow.didMiniaturizeNotification, NSWindow.didDeminiaturizeNotification, NSWindow.willCloseNotification, NSWindow.didBecomeMainNotification, NSWindow.didResignMainNotification] {
            NotificationCenter.default.publisher(for: notification).sink { [weak self] _ in
                DispatchQueue.main.async { self?.scheduleStatusSnapshot() }
            }.store(in: &subscriptions)
        }
        for service in [stone.objectWillChange, cameras.objectWillChange, tesla.objectWillChange] {
            service.sink { [weak self] _ in self?.objectWillChange.send(); self?.scheduleStatusSnapshot() }.store(in: &subscriptions)
        }
        for page in [ConnectorPage.beepster, .reminderz] where UserDefaults.standard.bool(forKey: "enabled." + page.rawValue) { enable(page) }
        if UserDefaults.standard.bool(forKey: "stone.enabled") { stone.start() }
        updater.start()
        cameras.start()
        Task { await refresh() }
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }
    func setVisible(_ visible: Bool, page: ConnectorPage) {
        ConnectorVisibility(defaults: .standard).setVisible(visible, for: page)
        visiblePages = ConnectorPage.connectors.filter { ConnectorVisibility(defaults: .standard).isVisible($0) }
        if visible { Task { await refresh() } }
    }
    func enable(_ page: ConnectorPage) {
        if page == .beepster && beepster == nil {
            let module = BeepsterModule()
            beepster = module
            module.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send(); self?.scheduleStatusSnapshot() }.store(in: &subscriptions)
            legacyViews[page] = module.makeContent()
            module.resumeOwnedService()
        } else if page == .reminderz && reminderz == nil {
            let module = ReminderzModule()
            reminderz = module
            module.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send(); self?.scheduleStatusSnapshot() }.store(in: &subscriptions)
            legacyViews[page] = module.makeContent()
        }
        UserDefaults.standard.set(true, forKey: "enabled." + page.rawValue)
    }
    func requirements(_ page: ConnectorPage) -> [ConnectorRequirement] {
        switch page {
        case .stone: return stone.requirements
        case .beepster: return beepster.map { $0.requirements + $0.agentRequirements } ?? unchecked([("contacts", "Contact names"), ("beeper", "Beeper connection"), ("route", "Private connection"), ("attachments", ConnectorLabels.attachments)], page: page)
        case .reminderz: return reminderz?.requirements ?? unchecked([("permission", "Reminders access"), ("service", "Mac service"), ("route", "Private connection")], page: page)
        case .pome: return cameras.overviewRequirements
        case .tesla: return tesla.requirements
        default: return []
        }
    }
    private func unchecked(_ names: [(String, String)], page: ConnectorPage) -> [ConnectorRequirement] {
        names.map { ConnectorRequirement($0.0, $0.1, false, "Enable \(page.rawValue) to check this requirement.") }
    }
    func refresh() async {
        guard !refreshing else { return }
        refreshing = true
        defer { refreshing = false; scheduleStatusSnapshot() }
        // Hidden connectors retain their settings and service, but do not add dashboard checks.
        if visiblePages.contains(.beepster) { beepster?.checkConnection() }
        if visiblePages.contains(.reminderz) { reminderz?.checkConnection() }
        if visiblePages.contains(.stone) { await stone.refresh() }
        if visiblePages.contains(.pome) { await cameras.check() }
        if visiblePages.contains(.tesla) { await tesla.check() }
    }
    private var snapshotPending = false
    private func scheduleStatusSnapshot() {
        guard !snapshotPending else { return }
        snapshotPending = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.snapshotPending = false
            let checks = self.visiblePages.map { page in
                ["app": page.rawValue, "requirements": self.requirements(page).map {
                    ["id": $0.id, "title": $0.title, "ready": $0.ready, "checking": $0.checking, "detail": $0.id == "route" ? $0.detail : ""] as [String: Any]
                }] as [String: Any]
            }
            let windows = NSApp.windows.filter { $0.identifier?.rawValue == "connector" || $0.title == "Organik Apps Pebble Connector" }
            let snapshot: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier,
                "checkedAt": ISO8601DateFormatter().string(from: Date()), "apps": checks,
                "windowVisible": windows.contains { $0.isVisible && !$0.isMiniaturized },
                "windowMiniaturized": windows.contains { $0.isMiniaturized }, "applicationActive": NSApp.isActive]
            let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("Organik Apps Pebble Connector")
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let file = folder.appendingPathComponent("ConnectionStatus.json")
                try JSONSerialization.data(withJSONObject: snapshot, options: [.prettyPrinted, .sortedKeys]).write(to: file, options: .atomic)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            } catch { /* Local diagnostics must never interfere with connections. */ }
        }
    }
    func shutdown() { timer?.invalidate(); stone.shutdown(); beepster?.shutdown(); reminderz?.stopModule(); cameras.shutdown() }
}

struct RequirementLight: View {
    let requirement: ConnectorRequirement
    var body: some View {
        HStack(spacing: 7) {
            if requirement.checking { ProgressView().controlSize(.mini) }
            else { Circle().fill(requirement.ready ? Color.green : Color.red).frame(width: 9, height: 9) }
            Text(requirement.title).font(.callout)
            if requirement.checking { Text("Checking…").font(.caption).foregroundStyle(.secondary) }
        }
        .help(requirement.checking ? "Checking this requirement…" : (requirement.ready ? "Ready: " : "Needs attention: ") + requirement.detail)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(requirement.title + (requirement.checking ? ": checking" : requirement.ready ? ": ready" : ": needs attention"))
    }
}

struct RequirementList: View {
    let requirements: [ConnectorRequirement]
    var body: some View {
        GroupBox("Requirements") {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(requirements) { requirement in
                    VStack(alignment: .leading, spacing: 4) {
                        RequirementLight(requirement: requirement)
                        Text(requirement.detail).font(.callout).foregroundStyle(.secondary).textSelection(.enabled).padding(.leading, 16)
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
        }
    }
}

struct SetupStep<Content: View>: View {
    let number: Int
    let title: String
    let detail: String
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(number). \(title)").font(.headline)
            Text(detail).font(.callout).foregroundStyle(.secondary)
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
    }
}

struct PrivateSetupHelp: View {
    var body: some View {
        Text("Install Tailscale on this Mac and your phone, sign in to the same account, and connect both devices. Then use Start private connection below. If Tailscale asks you to enable HTTPS, follow its prompt and try again.").font(.callout).foregroundStyle(.secondary)
        Link("Get Tailscale", destination: URL(string: "https://tailscale.com/download")!)
    }
}

struct ConnectorDetail<Connection: View, Troubleshooting: View>: View {
    let page: ConnectorPage
    let requirements: [ConnectorRequirement]
    let busy: Bool
    let message: String
    @ViewBuilder var connection: () -> Connection
    @ViewBuilder var troubleshooting: () -> Troubleshooting
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(page.rawValue).font(.largeTitle.weight(.semibold))
                    Text(page.detail).foregroundStyle(.secondary)
                }
                Text(requirements.contains(where: \.checking) ? "Checking your saved connections… You can continue setup below." : requirements.allSatisfy(\.ready) ? "Your Mac is ready. Connect your phone below, or review your setup." : "Set up this app by following the steps below. Existing settings and pairing are reused.")
                    .font(.callout).foregroundStyle(.secondary)
                GroupBox("Setup") {
                    VStack(alignment: .leading, spacing: 12) {
                        connection()
                        HStack {
                            if busy { ProgressView().controlSize(.small) }
                            Text(message).font(.callout).foregroundStyle(.secondary)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(10)
                }
                RequirementList(requirements: requirements)
                DisclosureGroup("Troubleshooting") {
                    VStack(alignment: .leading, spacing: 14) { troubleshooting() }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12)
                }
                Text("Keep this Mac awake and Tailscale connected on both Mac and phone. Closing the window keeps enabled services running.")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(28).frame(maxWidth: 850, alignment: .leading).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct NotesyView: View {
    @ObservedObject var service: NotesyService
    var body: some View {
        ConnectorDetail(page: .stone, requirements: service.requirements, busy: service.busy, message: service.status) {
            SetupStep(number: 1, title: "Choose your Obsidian vault", detail: "Choose the folder containing your Obsidian notes. Notesy remembers access to this folder and starts its connection automatically so your watch can browse notes and save dictation.") {
                if let vault = service.vault { Text(vault.path).font(.caption).textSelection(.enabled) }
                Button(service.vault == nil ? "Choose vault…" : "Change vault…") { service.chooseVault() }.disabled(service.busy)
                if service.vault != nil && !service.running {
                    Button("Start Notesy") { service.start() }.disabled(service.busy)
                }
            }
            SetupStep(number: 2, title: "Connect Mac and phone privately", detail: "This lets your phone reach Notesy through Tailscale.") {
                PrivateSetupHelp()
                Button(service.privateReady ? "Private connection ready" : "Start private connection") { service.startPrivate() }.disabled(service.busy || !service.running || service.privateReady)
            }
            SetupStep(number: 3, title: "Pair Notesy on your phone", detail: "Install Notesy on your Pebble first. Open Connect phone, scan the pairing code, and paste the details into Pebble → Notesy → Settings. Test, save, then refresh Notesy on your watch.") {
                HStack {
                    Button("Open Notesy watch package") { if let file = Bundle.main.resourceURL?.appendingPathComponent("Notesy/Notesy.pbw") { NSWorkspace.shared.activateFileViewerSelecting([file]) } }
                    Button("Connect phone") { service.connectPhone() }.buttonStyle(.borderedProminent).disabled(service.busy || !service.privateReady)
                }
                Text(service.lastPhone).font(.caption).foregroundStyle(.secondary)
            }
            Button("Check connection") { Task { await service.refresh() } }.disabled(service.busy)
        } troubleshooting: {
            Text("Vault unavailable: confirm the folder still exists and choose it again in step 1. Phone cannot connect: check Tailscale on both devices, then repeat step 3. Watch drafts retry while Notesy is active and remain tied to their original vault.")
            HStack {
                Button("Open vault") { if let vault = service.vault { NSWorkspace.shared.open(vault) } }.disabled(service.vault == nil)
                Button(service.running ? "Stop service" : "Start service") { if service.running { service.stop() } else { service.start() } }.disabled(service.busy || service.vault == nil)
                Button("Repair private connection") { service.startPrivate() }.disabled(service.busy || !service.running)
            }
        }
    }
}

struct BeepsterView: View {
    @ObservedObject var module: BeepsterModule
    private func ready(_ id: String) -> Bool { module.requirements.first { $0.id == id }?.ready == true }
    var body: some View {
        ConnectorDetail(page: .beepster, requirements: module.requirements, busy: module.busy, message: module.message) {
            SetupStep(number: 1, title: "Connect Beeper Desktop", detail: "Open Beeper Desktop and sign in. In Beeper Settings → Beeper Desktop API, enable Allow connections and create a token for Beepster. Connect Beeper asks for that token if needed, requests Contacts access for names, and starts the Mac connection. Existing tokens and permissions are reused.") {
#if APP_STORE
                if !module.serviceConflictMessage.isEmpty { Text(module.serviceConflictMessage).font(.callout) }
                if module.legacyServiceDetected {
                    Text("A previous Beepster service is running. Switch ownership to keep your pairing and prevent two services running together.")
                    Button("Switch from previous service…") { module.switchFromLegacyService() }.disabled(module.startingOwnedService)
                }
#endif
                HStack {
                    Button("Open Beeper Desktop") { module.openBeeper() }
                    Button(ready("beeper") && ready("contacts") ? "Beeper connected" : "Connect Beeper") { module.connect() }
                        .buttonStyle(.borderedProminent).disabled(ready("beeper") && ready("contacts"))
                }.disabled(module.busy)
            }
            SetupStep(number: 2, title: "Connect Mac and phone privately", detail: "Tailscale lets your phone reach Beepster away from this Mac. Connect Beeper sets this up automatically when Tailscale is ready; otherwise complete it here.") {
                PrivateSetupHelp()
                Button(ready("route") ? "Private connection ready" : "Start private connection") { module.repairRoute() }.disabled(module.busy || !ready("beeper") || ready("route"))
            }
            SetupStep(number: 3, title: "Pair Beepster on your phone", detail: "Install Beepster on your Pebble. Open Connect phone and follow the pairing instructions, then save Beepster’s settings in the Pebble phone app and refresh Beepster on your watch.") {
                Button("Connect phone") { module.pairPhone() }.buttonStyle(.borderedProminent).disabled(module.busy || !ready("route"))
            }
            DisclosureGroup("Optional: Apple Messages photos and GIFs") {
                Text(module.attachmentSetupDetail).font(.callout).foregroundStyle(.secondary)
                Text(module.mediaAccessMessage).font(.callout).foregroundStyle(.secondary)
                HStack {
                    Button("Allow attachment access") { module.openMediaAccessSettings() }
                }.disabled(module.mediaAccessBusy || module.busy)
            }
            DisclosureGroup("Optional: Hermes and OpenClaw") {
                Text("Connect each agent separately to its Telegram conversation for watch approvals and thread-specific instructions. Messaging works without agent setup.").font(.callout).foregroundStyle(.secondary)
                AgentSetupView(module:module)
            }
            Button("Check connection") { module.checkConnection() }.disabled(module.busy)
        } troubleshooting: {
            Text("If Beeper stops responding, keep Beeper Desktop open and check that its API is enabled. Use Change Beeper token below if the token expired. If contact names are missing, review Contacts access below.")
            HStack {
                Button("Change Beeper token") { module.editToken() }
                Button("Allow Contacts") { module.allowContacts() }
                Button("Repair service") { module.repairService() }
                Button("Repair private connection") { module.repairRoute() }
                Button("Open Contacts privacy settings") { module.privacySettings() }
            }.disabled(module.busy)
            HStack {
                Button("Check attachment access") { module.checkMediaAccess() }
                Button("Restart and recheck attachments") { module.checkMediaAccess(restart: true) }
            }.disabled(module.busy || module.mediaAccessBusy)
        }
    }
}

struct ReminderzView: View {
    @ObservedObject var module: ReminderzModule
    private func ready(_ id: String) -> Bool { module.requirements.first { $0.id == id }?.ready == true }
    var body: some View {
        ConnectorDetail(page: .reminderz, requirements: module.requirements, busy: module.busy, message: module.message) {
            SetupStep(number: 1, title: "Allow Reminders and start sync", detail: "Allow access to Apple Reminders so your watch can read lists, add reminders, and mark them complete. This starts sync on the Mac and reuses existing pairing. If the standalone Reminderz Connector is running, quit it first.") {
                Button(ready("permission") && ready("service") ? "Reminders sync ready" : "Allow Reminders and start sync") { module.setUpSync() }
                    .buttonStyle(.borderedProminent).disabled(module.busy || (ready("permission") && ready("service")))
            }
            SetupStep(number: 2, title: "Connect Mac and phone privately", detail: "Tailscale lets your phone reach your reminders while away from this Mac. Your reminders stay in Apple Reminders.") {
                PrivateSetupHelp()
                Button(ready("route") ? "Private connection ready" : "Start private connection") { module.repairRoute() }.disabled(module.busy || !ready("service") || ready("route"))
            }
            SetupStep(number: 3, title: "Pair Reminderz on your phone", detail: "Install Reminderz on your Pebble. Open Connect phone and scan the pairing code. Copy the details into Pebble → Reminderz → Settings, save, then refresh Reminderz on your watch.") {
                Button("Connect phone") { module.pairPhone() }.buttonStyle(.borderedProminent).disabled(module.busy || !ready("route"))
            }
            Button("Check connection") { module.checkConnection() }.disabled(module.busy)
        } troubleshooting: {
            Text("If access was denied, allow it in System Settings → Privacy & Security → Reminders. If sync stops, check the requirements above and restart the service. Only one Reminderz Connector can run at a time.")
            HStack {
                Button(module.isStopped ? "Start service" : "Stop service") { module.toggleRunning() }
                Button("Restart service") { module.restart() }
                Button("Repair private connection") { module.repairRoute() }
                Button("Unlock Keychain") { module.unlockToken() }
            }.disabled(module.busy)
            Button("Open Reminders privacy settings") { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders")!) }
        }
    }
}

struct ExternalServiceView: View {
    let page: ConnectorPage
    @ObservedObject var service: ExternalService
    var body: some View {
        ConnectorDetail(page: page, requirements: service.requirements, busy: service.busy, message: service.status) {
            SetupStep(number: 1, title: "Prepare your Tesla gateway", detail: "Tesla is coming soon and currently requires an existing personal gateway. Developer registration, Tesla sign-in, and the command proxy must already be configured. Enter that gateway’s host and port below.") {
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 10) {
                    GridRow { Text("Service host"); TextField("Hostname or IPv4 address", text: $service.localHost) }
                    GridRow { Text("Service port"); TextField("Local port", text: $service.localPort) }
                }.textFieldStyle(.roundedBorder).disabled(service.busy)
                Text("Use 127.0.0.1 for a service on this Mac, or the host of the computer running it.").font(.caption).foregroundStyle(.secondary)
                Button("Save and check service") { Task { await service.saveAndCheck() } }.buttonStyle(.borderedProminent).disabled(service.busy)
            }
            SetupStep(number: 2, title: "Connect Mac and phone privately", detail: "Complete step 1 first. Keep the suggested private port unless your setup needs a different one.") {
                PrivateSetupHelp()
                HStack { Text("Private HTTPS port"); TextField("Private port", text: $service.privatePort).frame(width: 110).textFieldStyle(.roundedBorder) }.disabled(service.busy)
                Button("Start private connection") { service.privateConnection() }.disabled(service.busy || !service.localReady)
            }
            SetupStep(number: 3, title: "Connect \(page.rawValue) on your phone", detail: "Install \(page.rawValue) on your Pebble. Copy the phone address into Pebble → \(page.rawValue) → Settings and save. Refresh the app on your watch to test it.") {
                if !service.origin.isEmpty { Text(service.origin).font(.callout).textSelection(.enabled) }
                Button("Copy phone address") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(service.origin, forType: .string) }.buttonStyle(.borderedProminent).disabled(!service.privateReady || service.busy)
            }
            Button("Check connection") { Task { await service.check() } }.disabled(service.busy)
        } troubleshooting: {
            Text("If the Mac service check fails, confirm that the service is running and its host and port match step 1. If the phone cannot connect, check Tailscale on both devices and repeat steps 2 and 3. A private port used by another service is preserved; choose a different private port if needed.")
        }
    }
}

struct ConnectorSettings: View {
    @ObservedObject var model: ConnectorModel
    @ObservedObject var updater: ConnectorUpdater
    @State private var loginEnabled = SMAppService.mainApp.status == .enabled
    @State private var loginMessage = ""
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Settings").font(.largeTitle.weight(.semibold))
                GroupBox("Visible connectors") {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(ConnectorPage.connectors) { page in
                            Toggle(isOn: Binding(get: { model.visiblePages.contains(page) }, set: { model.setVisible($0, page: page) })) {
                                HStack { Label(page.rawValue, systemImage: page.symbol); if page == .tesla { Text("Coming soon").font(.caption).foregroundStyle(.secondary) } }
                            }
                        }
                        Text("Hidden connectors disappear from the sidebar and overview. Their settings, pairing, and running services are preserved. Tesla requires an existing personal gateway.").font(.callout).foregroundStyle(.secondary)
                    }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
                }
                GroupBox("Connector updates") {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Version \(updater.version)")
                        if updater.usesAppStore {
                            Button("Open App Store updates") { updater.check() }
                            Text(updater.status).font(.callout).foregroundStyle(.secondary)
                            Text("Watch apps are updated separately.").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Toggle("Automatically check for updates", isOn: $updater.automatic)
                            Stepper("Check every \(updater.intervalHours) hours", value: $updater.intervalHours, in: 1...168)
                                .disabled(!updater.automatic).frame(maxWidth: 300)
                            Button("Check for updates…") { updater.check() }.disabled(!updater.canCheck)
                            Text(updater.status).font(.callout).foregroundStyle(.secondary)
                            Text("Updates are downloaded and installed after you approve them. Watch apps are updated separately.").font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
                }
                GroupBox("Appearance") {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle("Run in the menu bar and hide the Dock icon", isOn: $model.menuBarMode)
                        Text("Use the menu bar icon to reopen the Connector or quit. Closing the window keeps your connections running. This choice is remembered at launch.").font(.callout).foregroundStyle(.secondary)
                    }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
                }
                GroupBox("Startup") {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle("Start at login", isOn: $loginEnabled).onChange(of: loginEnabled) { _, value in
                            do {
                                if value { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                                loginMessage = SMAppService.mainApp.status == .requiresApproval ? "Allow Organik Apps Pebble Connector in System Settings → General → Login Items." : ""
                            } catch { loginMessage = error.localizedDescription }
                            loginEnabled = SMAppService.mainApp.status == .enabled
                        }
                        if !loginMessage.isEmpty { Text(loginMessage).font(.callout).foregroundStyle(.secondary) }
                    }.padding(10).frame(maxWidth: .infinity, alignment: .leading)
                }
            }.padding(28).frame(maxWidth: 850).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct ConnectorWindow: View {
    @ObservedObject var model: ConnectorModel
    var body: some View {
        NavigationSplitView {
            List(selection: $model.selection) {
                Label("Overview", systemImage: ConnectorPage.overview.symbol).tag(ConnectorPage.overview)
                Section("Your Pebble apps") {
                    ForEach(model.visiblePages) { page in Label(page.rawValue, systemImage: page.symbol).tag(page) }
                }
                Label("Settings", systemImage: ConnectorPage.settings.symbol).tag(ConnectorPage.settings)
            }.navigationSplitViewColumnWidth(min: 175, ideal: 195, max: 230)
        } detail: {
            switch model.selection ?? .overview {
            case .overview:
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("Overview").font(.largeTitle.weight(.semibold))
                        Text("Choose an app in the sidebar for step-by-step setup. Fix opens that app’s setup and connection details.").foregroundStyle(.secondary)
                        if model.visiblePages.isEmpty { Text("Show connectors in Settings to see their status here.").foregroundStyle(.secondary) }
                        ForEach(model.visiblePages) { page in
                            GroupBox {
                                HStack(alignment: .top, spacing: 18) {
                                    Label(page.rawValue, systemImage: page.symbol).font(.headline).frame(width: 115, alignment: .leading)
                                    VStack(alignment: .leading, spacing: 10) {
                                        ForEach(model.requirements(page)) { RequirementLight(requirement: $0) }
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                    if model.requirements(page).contains(where: { !$0.ready && !$0.checking }) { Button("Fix") { model.selection = page } }
                                }.padding(12)
                            }
                        }
                    }.padding(28).frame(maxWidth: 850).frame(maxWidth: .infinity, alignment: .leading)
                }
            case .stone: NotesyView(service: model.stone)
            case .beepster:
                if let module = model.beepster { BeepsterView(module: module) } else { enablePage(.beepster) }
            case .reminderz:
                if let module = model.reminderz { ReminderzView(module: module) } else { enablePage(.reminderz) }
            case .pome: PomeSetupView(service: model.cameras)
            case .tesla: ExternalServiceView(page: .tesla, service: model.tesla)
            case .settings: ConnectorSettings(model: model, updater: model.updater)
            }
        }.frame(minWidth: 820, minHeight: 620)
        .onChange(of: model.visiblePages) { _, pages in
            if let selected = model.selection, ConnectorPage.connectors.contains(selected), !pages.contains(selected) { model.selection = .overview }
        }
    }
    private func enablePage(_ page: ConnectorPage) -> some View {
        ProgressView("Preparing \(page.rawValue) setup…")
            .onAppear { model.enable(page) }
    }

}

@MainActor final class OrganikAppDelegate: NSObject, NSApplicationDelegate {
    var model: ConnectorModel?
#if APP_STORE
    private var quitPending = false
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if !quitPending {
            quitPending = true
            Task {
                await model?.cameras.prepareToQuit()
                sender.reply(toApplicationShouldTerminate: true)
            }
        }
        return .terminateLater
    }
#endif
    private var statusItem: NSStatusItem?
    private var presentationSubscription: AnyCancellable?

    func configurePresentation(_ model: ConnectorModel) {
        presentationSubscription = model.$menuBarMode.sink { [weak self] enabled in
            self?.applyMenuBarMode(enabled)
        }
    }
    private func applyMenuBarMode(_ enabled: Bool) {
        if enabled {
            // Install the reopening control before removing the Dock entry.
            if statusItem == nil {
                let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
                item.button?.image = NSImage(systemSymbolName: "link.circle", accessibilityDescription: "Organik Connector")
                item.button?.toolTip = "Organik Apps Connector"
                let menu = NSMenu()
                for (title, action) in [("Open Connector", #selector(openConnector)), ("Settings…", #selector(openSettings)), ("Check connections", #selector(checkConnections)), ("Check for updates…", #selector(checkUpdates))] {
                    let entry = NSMenuItem(title: title, action: action, keyEquivalent: "")
                    entry.target = self
                    menu.addItem(entry)
                }
                menu.addItem(.separator())
                let quit = NSMenuItem(title: "Quit Organik Connector", action: #selector(quitConnector), keyEquivalent: "q")
                quit.target = self
                menu.addItem(quit)
                item.menu = menu
                statusItem = item
            }
            NSApp.setActivationPolicy(.accessory)
        } else {
            NSApp.setActivationPolicy(.regular)
            if let item = statusItem { NSStatusBar.system.removeStatusItem(item); statusItem = nil }
        }
    }
    @objc private func openConnector() {
        if let window = NSApp.windows.first(where: { $0.identifier?.rawValue == "connector" }) ?? NSApp.windows.first(where: { $0.title == "Organik Apps Pebble Connector" }) {
            window.deminiaturize(nil)
            window.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc private func openSettings() { model?.selection = .settings; openConnector() }
    @objc private func checkConnections() { Task { await model?.refresh() } }
    @objc private func checkUpdates() { model?.updater.check() }
    @objc private func quitConnector() { NSApp.terminate(nil) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationWillTerminate(_ notification: Notification) { model?.shutdown() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { openConnector() }
        return true
    }
}
@main struct OrganikConnectorApp: App {
    @NSApplicationDelegateAdaptor(OrganikAppDelegate.self) var delegate
    @StateObject private var model = ConnectorModel()
    var body: some Scene {
        Window("Organik Apps Pebble Connector", id: "connector") {
            ConnectorWindow(model: model).onAppear {
                if delegate.model == nil { delegate.model = model; model.start(); delegate.configurePresentation(model) }
            }
        }.defaultSize(width: 970, height: 780)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(after: .appInfo) {
                UpdateMenu(updater: model.updater)
                Button("Acknowledgments") {
                    if let file = Bundle.main.resourceURL?.appendingPathComponent("ACKNOWLEDGMENTS.md") { NSWorkspace.shared.open(file) }
                }
                Button("Open Notesy watch package") {
                    if let file = Bundle.main.resourceURL?.appendingPathComponent("Notesy/Notesy.pbw") { NSWorkspace.shared.activateFileViewerSelecting([file]) }
                }
            }
        }
    }
}
struct UpdateMenu: View {
    @ObservedObject var updater: ConnectorUpdater
    var body: some View { Button("Check for updates…") { updater.check() }.disabled(!updater.canCheck) }
}
