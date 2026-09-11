import AppKit
import Foundation
import Security
import Combine
#if APP_STORE
import Contacts
#endif

final class BeepsterModule: NSObject, ObservableObject {
    @Published var requirements: [ConnectorRequirement] = [
        ConnectorRequirement("contacts", "Contact names", false, "Not checked"),
        ConnectorRequirement("beeper", "Beeper connection", false, "Not checked"),
        ConnectorRequirement("route", "Private connection", false, "Not checked"),
        ConnectorRequirement("attachments", ConnectorLabels.attachments, false, "Not checked")]
    @Published var busy = false
    @Published var message = "Not checked"
    @Published var agentState: AgentSetupState?
    @Published var agentRequirements: [ConnectorRequirement] = []
    @Published var agentBusy = false
    @Published var agentRefreshing = false
    @Published var mediaAccessBusy = false
    @Published var mediaAccessMessage = "Needed only for attachments stored by Apple Messages."
    private var mediaAccessRequirement = ConnectorRequirement("attachments", ConnectorLabels.attachments, false, "Not checked")
    private var agentRevision = 0
    private var checking = false
    private var actionRevision = 0
    @Published var agentMessage = "Check connections to discover your agent sessions and Telegram chats."
    var agentPages = 1
    private var checkedManagedGateway = false
#if APP_STORE
    private let bundledRuntime = BundledGatewayRuntime()
    @Published private(set) var startingOwnedService = false
    @Published private(set) var legacyServiceDetected = false
    @Published private(set) var serviceConflictMessage = ""
    private func knownLegacyService() -> Bool {
        guard let expected = LegacyGatewayHandoff.expectedProgram else { return false }
        let result = run("/bin/launchctl", ["print", LegacyGatewayHandoff.target])
        return result.0 == 0 && LegacyGatewayHandoff.matches(result.1, expectedProgram: expected)
    }
    func switchFromLegacyService() {
        let alert = NSAlert()
        alert.messageText = "Switch Beepster to this Connector?"
        alert.informativeText = "Stop the previous Beepster background service and turn off its automatic launch. Its files, settings and pairing are preserved. This Connector will run Beepster while it is open."
        alert.addButton(withTitle: "Switch service")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        startingOwnedService = true
        DispatchQueue.global(qos: .utility).async {
            guard self.knownLegacyService() else {
                DispatchQueue.main.async { self.startingOwnedService = false; self.message = "The previous service changed. Check its owner before switching; nothing was stopped." }
                return
            }
            let disabledState = self.run("/bin/launchctl", ["print-disabled", "gui/\(getuid())"])
            guard disabledState.0 == 0 else {
                DispatchQueue.main.async { self.startingOwnedService = false; self.message = "macOS did not allow checking the previous service. Stop it from the older Connector before continuing." }
                return
            }
            let wasDisabled = disabledState.1.contains("\"org.beepster.gateway\" => true")
            let disabled = self.run("/bin/launchctl", ["disable", LegacyGatewayHandoff.target])
            let stopped = disabled.0 == 0 ? self.run("/bin/launchctl", ["bootout", LegacyGatewayHandoff.target]) : disabled
            if stopped.0 != 0 && disabled.0 == 0 && !wasDisabled {
                _ = self.run("/bin/launchctl", ["enable", LegacyGatewayHandoff.target])
            }
            DispatchQueue.main.async {
                self.startingOwnedService = false
                guard stopped.0 == 0 else { self.message = "macOS could not stop the previous service. Its files and pairing are unchanged. Stop it from the older Connector, then retry setup."; return }
                self.legacyServiceDetected = false
                self.resumeOwnedService()
            }
        }
    }
    let storeAgents = StoreAgentConfiguration()
#endif
    func shutdown() {
#if APP_STORE
        bundledRuntime.stop(permanently: true)
#endif
    }
    func applyStoreAgentConfiguration() {
#if APP_STORE
        DispatchQueue.global(qos: .utility).async {
            _ = self.restartGateway()
            DispatchQueue.main.async { self.agentLinks() }
        }
#endif
    }
    func resumeOwnedService() {
#if APP_STORE
        startingOwnedService = true
        DispatchQueue.global(qos: .utility).async {
            let result = self.installBundledService()
            if result.0 {
                for _ in 0..<20 {
                    if self.gatewayHealth().0 { break }
                    Thread.sleep(forTimeInterval: 0.1)
                }
            }
            DispatchQueue.main.async {
                self.startingOwnedService = false
                if !result.0 { self.message = result.1 }
                self.checkConnection()
            }
        }
#endif
    }
    private func restartGateway() -> (Int32, String) {
#if APP_STORE
        bundledRuntime.stop()
        let result = installBundledService()
        return (result.0 ? 0 : -1, result.1)
#else
        return run("/bin/launchctl", ["kickstart", "-k", "gui/\(getuid())/org.beepster.gateway"])
#endif
    }
    func connect() { setUpBeepster() }
    func pairPhone() { connectPhone() }
    func checkConnection() { if !busy { refresh() } }
    var serviceSetupDetail: String {
#if APP_STORE
        "Allow Contacts when macOS asks so Beepster can show names. Set up service starts the bundled gateway while this Connector is running and checks your Beeper connection."
#else
        "Allow Contacts when macOS asks so Beepster can show names. Set up service installs the bundled service and checks your Beeper connection."
#endif
    }
    func repairService() { installBackgroundService() }
    func editToken() { setBeeperToken() }
    func allowContacts() { enableContacts() }
    func repairRoute() { startPrivateRoute() }
    func openBeeper() { openBeeperDesktop() }
    func privacySettings() { openPrivacySettings() }
    var attachmentSetupDetail: String {
#if APP_STORE
        return "Choose the Messages attachments folder to allow access to photos and GIFs. The Connector remembers this folder and checks access through its running service. macOS may also require privacy permission for protected attachments."
#else
        return "macOS protects attachments stored by Messages. To view them, grant Full Disk Access to Beepster’s background service. Allow access opens System Settings and selects the service file in Finder; drag that node file into the Full Disk Access list and turn it on."
#endif
    }
    func openMediaAccessSettings() {
#if APP_STORE
        if storeAgents.chooseAttachments() {
            mediaAccessMessage = "Attachments folder access saved. Restart and recheck to verify the running service."
            checkMediaAccess(restart: true)
        } else { mediaAccessMessage = storeAgents.message }
#else
        let node = supportDirectory.appendingPathComponent("bin/node")
        guard FileManager.default.fileExists(atPath: node.path) else {
            mediaAccessMessage = "Choose Set up service first, then allow Messages attachment access."
            return
        }
        NSWorkspace.shared.activateFileViewerSelecting([node])
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles") {
            NSWorkspace.shared.open(url)
        }
        mediaAccessMessage = "Drag the selected node file into Full Disk Access and turn it on. Then choose Restart and recheck."
#endif
    }
    func checkMediaAccess(restart: Bool = false) {
        guard !mediaAccessBusy else { return }
        mediaAccessBusy = true
        let revision = actionRevision
        Task { @MainActor in
            do {
                if restart {
                    let result = await Task.detached { self.restartGateway() }.value
                    guard result.0 == 0 else { throw ConnectorError(message: "Could not restart Beepster. Choose Set up service and try again.") }
                    try await Task.sleep(nanoseconds: 700_000_000)
                }
                let secret = await Task.detached { self.run(self.keychainHelperPath(), ["get", "gateway-token"], timeout: nil) }.value
                guard secret.0 == 0 else { throw ConnectorError(message: "Choose Set up service before checking attachment access.") }
                let result = try await jsonRequest(URL(string: "http://127.0.0.1:8794/v1/media/access")!, token: secret.1.trimmingCharacters(in: .whitespacesAndNewlines))
                guard revision == self.actionRevision else { self.mediaAccessBusy = false; return }
                self.updateMediaAccess(result)
                self.mediaAccessBusy = false
            } catch {
                if revision == self.actionRevision { self.updateMediaAccess(["code": "CHECK_FAILED"]) }
                self.mediaAccessBusy = false
            }
        }
    }
    func updateMediaAccess(_ result: [String: Any]) {
        switch result["code"] as? String {
        case "READY": self.mediaAccessMessage = "Messages attachment folder is accessible. Open the photo or GIF again on your watch."
        case "MEDIA_PERMISSION": self.mediaAccessMessage = "Messages attachment access is blocked. Allow the selected Beepster service in Full Disk Access, then restart and recheck."
        case "SETUP_REQUIRED": self.mediaAccessMessage = "Choose the Messages attachments folder, then restart and recheck."
        case "NO_LOCAL_ATTACHMENTS": self.mediaAccessMessage = "No local Messages attachment folder was found. No access change is needed unless you use Messages attachments."
        case "NOT_APPLICABLE": self.mediaAccessMessage = "Messages attachment access is not required on this system."
        default: self.mediaAccessMessage = "Attachment access could not be determined. Try checking again."
        }
        mediaAccessRequirement = ConnectorRequirement("attachments", ConnectorLabels.attachments, result["code"] as? String == "READY" && result["allowed"] as? Bool == true, mediaAccessMessage)
        if let index = requirements.firstIndex(where: { $0.id == "attachments" }) { requirements[index] = mediaAccessRequirement }
        else { requirements.append(mediaAccessRequirement) }
    }
    func optionalApprovals() { enableOpenClawApprovals() }
    func agentLinks() {
        agentCommand(["action":"status"])
    }
    func agentCommand(_ input: [String: Any]) {
        let isRefresh = input["action"] as? String == "status"
        guard !agentBusy, !isRefresh || !agentRefreshing else { return }
        guard let node = currentNodeResource(), let script = bundledResource("gateway/src/agent-setup.js") else {
            agentMessage = "Agent setup resources are missing. Update the unified Connector."
            return
        }
        var payload = input; payload["pages"] = agentPages
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data:data,encoding:.utf8) else { return }
        if isRefresh { agentRefreshing = true } else { agentBusy = true; agentRevision += 1 }
        let revision = agentRevision
        if !isRefresh { agentMessage = input["action"] as? String == "install" ? "Installing and enabling the Hermes bridge…" : "Updating agent setup…" }
        DispatchQueue.global(qos: .userInitiated).async {
            let result = self.run(node.path, [script.path, "--native"], input:json, timeout:90)
            DispatchQueue.main.async {
                if isRefresh { self.agentRefreshing = false } else { self.agentBusy = false }
                guard revision == self.agentRevision else { return }
                if result.0 == 0, let data = result.1.data(using:.utf8), let state = try? JSONDecoder().decode(AgentSetupState.self,from:data) {
                    if state.ok { self.agentState = state; self.updateAgentHealth(state.bridgeHealth) }
                    self.agentMessage = state.note.isEmpty ? "Connection check complete. Choose an agent session and its matching Telegram chat below." : state.note
                } else { self.agentMessage = "Agent setup did not respond. Check Beeper and your agent, then retry. No approval was sent." }
                }
            }
        }

    private var window: NSWindow! { NSApp.keyWindow ?? NSApp.windows.first }
    private var contactStatus: NSTextField!
    private var gatewayStatus: NSTextField!
    private var tailscaleStatus: NSTextField!
    private var openClawStatus: NSTextField!
    private var setupSummary: NSTextField!
    private var setupButton: NSButton!
    private var connectPhoneButton: NSButton!
    private var refreshButton: NSButton!
    private var advancedStack: NSStackView!
    private var advancedToggle: NSButton!
    private let supportDirectory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Beepster")
    private var launchAgentURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/org.beepster.gateway.plist")
    }

    func makeContent() -> NSView {
        let content = NSView()
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 13
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 25)
        ])

        let title = NSTextField(labelWithString: "Beepster")
        title.font = .systemFont(ofSize: 25, weight: .bold)
        stack.addArrangedSubview(title)
        let intro = wrappingLabel("One guided setup keeps your Pebble connected to Beeper through this Mac. No Terminal required.")
        intro.textColor = .secondaryLabelColor
        stack.addArrangedSubview(intro)
        let runningNote = wrappingLabel("You can close this window after setup. Keep Beeper Desktop open and Tailscale connected; Beepster’s background service keeps working.")
        runningNote.font = .systemFont(ofSize: 13, weight: .medium)
        runningNote.textColor = .systemBlue
        stack.addArrangedSubview(runningNote)

        setupSummary = wrappingLabel("Checking your setup…")
        setupSummary.font = .systemFont(ofSize: 18, weight: .semibold)
        stack.addArrangedSubview(setupSummary)

        contactStatus = statusRow("Contact names")
        gatewayStatus = statusRow("Beeper connection")
        tailscaleStatus = statusRow("Private connection")
        openClawStatus = statusRow("OpenClaw approvals (optional)")
        [contactStatus, gatewayStatus, tailscaleStatus, openClawStatus].forEach(stack.addArrangedSubview)

        let actionsTitle = NSTextField(labelWithString: "Get started")
        actionsTitle.font = .systemFont(ofSize: 17, weight: .semibold)
        stack.addArrangedSubview(actionsTitle)

        setupButton = button("Set Up Beepster", #selector(setUpBeepster))
        setupButton.keyEquivalent = "\r"
        setupButton.bezelStyle = .rounded
        setupButton.controlSize = .large
        connectPhoneButton = button("Connect Phone", #selector(connectPhone))
        refreshButton = button("Test Everything", #selector(refresh))
        let mainActions = [
            primaryActionRow(setupButton,
                             description: "Installs or repairs the Mac service, guides you through connecting Beeper, requests Contacts access, starts the private route, and checks the result."),
            primaryActionRow(connectPhoneButton,
                             description: "Copies the private address and shows the pairing code together with short phone instructions."),
            primaryActionRow(refreshButton,
                             description: "Checks Contacts, the live Beeper connection, and the private phone route in one pass.")
        ]
        for row in mainActions {
            stack.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        }

        advancedToggle = NSButton(title: "Advanced options", target: self, action: #selector(toggleAdvanced))
        advancedToggle.setButtonType(.pushOnPushOff)
        advancedToggle.bezelStyle = .rounded
        stack.addArrangedSubview(advancedToggle)

        advancedStack = NSStackView()
        advancedStack.orientation = .vertical
        advancedStack.alignment = .leading
        advancedStack.spacing = 8
        advancedStack.isHidden = true
        let advancedActions = [
            actionRow(button("Install or Repair", #selector(installBackgroundService)),
                      what: "Installs the bundled gateway and keeps it running after login.",
                      why: "Completes the Mac installation without Node, npm, Git, or Terminal."),
            actionRow(button("Set Beeper Token", #selector(setBeeperToken)),
                      what: "Stores a dedicated Beeper Desktop API token in Keychain.",
                      why: "The local gateway needs it to read conversations and send replies."),
            actionRow(button("Continue", #selector(enableContacts)),
                      what: "Requests read-only access to your Mac contacts.",
                      why: "Lets Apple conversations show names instead of email addresses or phone numbers."),
            actionRow(button("Open Privacy Settings", #selector(openPrivacySettings)),
                      what: "Opens macOS directly to the Contacts privacy controls.",
                      why: "Use this if access was previously denied or you want to review it."),
            actionRow(button("Start Private Route", #selector(startPrivateRoute)),
                      what: "Starts Tailscale Serve for the local Beepster gateway.",
                      why: "Gives your phone private HTTPS access without exposing Beepster publicly."),
            actionRow(button("OpenClaw Approvals", #selector(enableOpenClawApprovals)),
                      what: "Pairs Beepster with the local OpenClaw Gateway using approval-only operator access.",
                      why: "Lets the watch review exact protected actions inside Telegram with Approve once or Deny. This is optional."),
            actionRow(button("Install Guide", #selector(openInstallGuide)),
                      what: "Opens the complete step-by-step installation guide.",
                      why: "Provides exact repair instructions when a readiness check needs attention.")
        ]
        for row in advancedActions {
            advancedStack.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: advancedStack.widthAnchor).isActive = true
        }
        stack.addArrangedSubview(advancedStack)
        advancedStack.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true

        let footer = wrappingLabel("Your Beeper and OpenClaw credentials stay on this Mac and are never sent to the phone or watch.")
        footer.textColor = .secondaryLabelColor
        footer.font = .systemFont(ofSize: 12)
        stack.addArrangedSubview(footer)

        stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24).isActive = true
        refresh()
        return scrollingDocument(content)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    var overviewStatus: String { setupSummary?.stringValue ?? "Not checked" }

    func updateAgentHealth(_ health: [AgentBridgeHealth]?) {
        guard let health else {
            agentRequirements = agentRequirements.map { ConnectorRequirement($0.id, $0.title, false, "Bridge check unavailable. Update Connector and retry.") }
            return
        }
        agentRequirements = health.filter { $0.enabled }.map {
            ConnectorRequirement("agent-" + $0.provider, $0.provider == "hermes" ? "Hermes bridge" : "OpenClaw bridge", $0.ready, $0.detail)
        }
    }

    private func wrappingLabel(_ text: String) -> NSTextField {
        let label = NSTextField(wrappingLabelWithString: text)
        label.maximumNumberOfLines = 0
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return label
    }

    private func statusRow(_ name: String) -> NSTextField {
        let label = wrappingLabel("○  \(name): Checking…")
        label.font = .systemFont(ofSize: 16, weight: .medium)
        return label
    }

    private func button(_ title: String, _ action: Selector) -> NSButton {
        let result = NSButton(title: title, target: self, action: action)
        result.bezelStyle = .rounded
        return result
    }

    private func primaryActionRow(_ button: NSButton, description: String) -> NSStackView {
        button.widthAnchor.constraint(equalToConstant: 160).isActive = true
        let explanation = wrappingLabel(description)
        explanation.font = .systemFont(ofSize: 13)
        explanation.textColor = .secondaryLabelColor
        let row = NSStackView(views: [button, explanation])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 14
        explanation.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return row
    }

    private func actionRow(_ button: NSButton, what: String, why: String) -> NSStackView {
        button.widthAnchor.constraint(equalToConstant: 160).isActive = true
        let explanation = wrappingLabel("What: \(what)\nWhy: \(why)")
        explanation.font = .systemFont(ofSize: 12.5)
        explanation.textColor = .secondaryLabelColor
        let row = NSStackView(views: [button, explanation])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 14
        explanation.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return row
    }

    private func setStatus(_ label: NSTextField, ok: Bool, name: String, detail: String) {
        label.stringValue = "\(ok ? "●" : "⚠")  \(name): \(detail)"
        label.textColor = ok ? .systemGreen : .systemOrange
    }

    private func setOptionalStatus(_ label: NSTextField, state: String, detail: String) {
        label.stringValue = "\(state == "paired" ? "●" : "○")  OpenClaw approvals (optional): \(detail)"
        label.textColor = state == "paired" ? .systemGreen : .secondaryLabelColor
    }

    private func openClawApprovalHealth() -> (String, String) {
        guard let url = URL(string: "http://127.0.0.1:8794/health") else { return ("disabled", "off") }
        let semaphore = DispatchSemaphore(value: 0)
        var result = ("disabled", "off")
        URLSession.shared.dataTask(with: URLRequest(url: url, timeoutInterval: 4)) { data, _, _ in
            defer { semaphore.signal() }
            guard let data,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["openClawEnabled"] as? Bool == true else { return }
            let state = object["openClawState"] as? String ?? "connecting"
            let detail = state == "paired" ? "ready" : (state == "pairing-required" ? "approval needed in OpenClaw" : "connecting")
            result = (state, detail)
        }.resume()
        _ = semaphore.wait(timeout: .now() + 5)
        return result
    }

    private func setWorking(_ working: Bool, message: String) {
        actionRevision += 1
        busy = working
        self.message = message
        setupButton?.isEnabled = !working
        connectPhoneButton?.isEnabled = !working
        refreshButton?.isEnabled = !working
        setupSummary?.stringValue = message
        setupSummary?.textColor = working ? .secondaryLabelColor : .labelColor
    }

    @objc private func toggleAdvanced() {
        let showing = advancedToggle.state == .on
        advancedStack.isHidden = !showing

    }

    private func run(_ executable: String, _ arguments: [String], input: String? = nil, timeout: TimeInterval? = 8) -> (Int32, String) {
        let process = Process()
        let output = Pipe()
        // Large session/chat lists must not fill a pipe while we await exit.
        let spoolURL = arguments.contains("--native") ? FileManager.default.temporaryDirectory.appendingPathComponent("organik-agent-" + UUID().uuidString) : nil
        var spool: FileHandle?
        if let spoolURL {
            guard FileManager.default.createFile(atPath:spoolURL.path,contents:nil,attributes:[.posixPermissions:0o600]),
                  let handle = try? FileHandle(forWritingTo:spoolURL) else { return (-1,"Could not prepare private agent response") }
            spool = handle
        }
        defer { try? spool?.close(); if let spoolURL { try? FileManager.default.removeItem(at:spoolURL) } }
        let inputPipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        var environment = ProcessInfo.processInfo.environment
        // Tailscale's macOS app CLI fails with CLIError 3 when a GUI parent
        // launches it without TERM, even for noninteractive JSON commands.
        // LaunchServices normally omits TERM, so provide a neutral value.
        if environment["TERM"] == nil { environment["TERM"] = "dumb" }
#if APP_STORE
        if executable == currentNodeResource()?.path {
            environment.merge(storeAgents.environment()) { _, new in new }
            // Short-lived setup/health commands need the same bundled secret
            // transport as the owned gateway; Store installs no bin helper.
            if let helper = bundledResource("beepster-keychain") {
                environment["BEEPSTER_KEYCHAIN_HELPER"] = helper.path
            }
        }
#endif
        process.environment = environment
        if let spool {
            process.standardOutput = spool
            process.standardError = spool
        } else {
            process.standardOutput = output
            process.standardError = output
        }
        if input != nil { process.standardInput = inputPipe }
        do { try process.run() } catch { return (-1, error.localizedDescription) }
        if let input {
            inputPipe.fileHandleForWriting.write(Data(input.utf8))
            try? inputPipe.fileHandleForWriting.close()
        }
        if let timeout {
            let deadline = Date().addingTimeInterval(timeout)
            while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
            if process.isRunning {
                process.terminate()
                let terminationDeadline = Date().addingTimeInterval(1)
                while process.isRunning && Date() < terminationDeadline { Thread.sleep(forTimeInterval: 0.05) }
                if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            }
        }
        process.waitUntilExit()
        let data: Data
        if let spoolURL { data = (try? Data(contentsOf:spoolURL)) ?? Data() }
        else { data = output.fileHandleForReading.readDataToEndOfFile() }
        return (process.terminationStatus, String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func bundledResource(_ name: String) -> URL? {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("Beepster").appendingPathComponent(name),
              FileManager.default.fileExists(atPath: url.path) else { return nil }
        return url
    }

    private func tailscaleBinary() -> String? {
        ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"]
            .first(where: FileManager.default.isExecutableFile(atPath:))
    }

    private func phoneSetupURL() -> URL? {
        guard let binary = tailscaleBinary() else { return nil }
        let status = run(binary, ["status", "--json"])
        guard status.0 == 0,
              let data = status.1.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ownDevice = root["Self"] as? [String: Any],
              var dnsName = ownDevice["DNSName"] as? String else { return nil }
        dnsName = dnsName.trimmingCharacters(in: CharacterSet(charactersIn: "."))
        guard !dnsName.isEmpty, let servePort = tailscaleServePort(binary) else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = dnsName
        if servePort != 443 { components.port = servePort }
        components.path = "/configure"
        return components.url
    }

    private func tailscaleServePort(_ binary: String) -> Int? {
        let status = run(binary, ["serve", "status", "--json"])
        guard status.0 == 0,
              let data = status.1.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let web = root["Web"] as? [String: Any] else { return nil }
        for (listener, value) in web {
            guard let configuration = value as? [String: Any],
                  let handlers = configuration["Handlers"] as? [String: Any] else { continue }
            for value in handlers.values {
                guard let handler = value as? [String: Any],
                      let proxy = handler["Proxy"] as? String,
                      let proxyURL = URL(string: proxy),
                      ["127.0.0.1", "localhost"].contains(proxyURL.host ?? ""),
                      proxyURL.port == 8794,
                      let separator = listener.lastIndex(of: ":"),
                      let port = Int(listener[listener.index(after: separator)...]) else { continue }
                return port
            }
        }
        return nil
    }

    private func keychainHelperPath() -> String {
        let installed = supportDirectory.appendingPathComponent("bin/beepster-keychain")
        return FileManager.default.fileExists(atPath: installed.path)
            ? installed.path : (bundledResource("beepster-keychain")?.path ?? installed.path)
    }

    private func contactsHelperPath() -> String {
        let installed = supportDirectory.appendingPathComponent("bin/Beepster Contacts.app")
        return FileManager.default.fileExists(atPath: installed.path)
            ? installed.path : (bundledResource("Beepster Contacts.app")?.path ?? installed.path)
    }

    private func currentNodeResource() -> URL? {
#if arch(arm64)
        return bundledResource("node-arm64")
#else
        return bundledResource("node-x64")
#endif
    }

    private func randomHex(byteCount: Int) -> String? {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private func ensureSecret(_ account: String, value: @autoclosure () -> String?) -> Bool {
#if APP_STORE
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.beepster.gateway", kSecAttrAccount as String: account,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess { return true }
        // An inaccessible existing credential is not a missing credential.
        // Never replace phone pairing because authorization has not completed.
        guard status == errSecItemNotFound, let secret = value() else { return false }
        var add = query
        add.removeValue(forKey: kSecReturnData as String); add.removeValue(forKey: kSecMatchLimit as String)
        add[kSecValueData as String] = Data(secret.utf8)
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
#else
        let helper = keychainHelperPath()
        // The first read may wait while macOS presents a Keychain authorization
        // dialog. Let that request finish so we never orphan the dialog.
        if run(helper, ["get", account], timeout: nil).0 == 0 { return true }
        guard let secret = value(), !secret.isEmpty else { return false }
        return run(helper, ["set", account], input: secret, timeout: nil).0 == 0
#endif
    }

    fileprivate func installBundledService() -> (Bool, String) {
#if APP_STORE
        let known = !bundledRuntime.isRunning && knownLegacyService()
        if !bundledRuntime.isRunning && (known || LegacyGatewayHandoff.portIsOccupied()) {
            let conflict = known ? "The previous Beepster service is running. Choose Switch service below to preserve pairing and use this Connector." : "Another service is using port 8794. Quit its owning app before starting this Connector's service; nothing was stopped."
            DispatchQueue.main.async { self.legacyServiceDetected = known; self.serviceConflictMessage = conflict }
            return (false, conflict)
        }
        DispatchQueue.main.async { self.legacyServiceDetected = false; self.serviceConflictMessage = "" }
        guard let node = currentNodeResource(), let gateway = bundledResource("gateway"),
              let keychain = bundledResource("beepster-keychain"), let contacts = bundledResource("Beepster Contacts.app") else {
            return (false, "The bundled Beepster service is missing.")
        }
        guard ensureSecret("gateway-token", value: randomHex(byteCount: 32)),
              ensureSecret("pairing-code", value: String(Int.random(in: 100000...999999))) else {
            return (false, "Could not access the Beepster pairing credentials.")
        }
        do {
            try bundledRuntime.start(executable: node, arguments: [gateway.appendingPathComponent("src/cli.js").path],
                                     workingDirectory: gateway, environment: [
                "BEEPSTER_PORT": "8794", "BEEPSTER_HOST": "127.0.0.1",
                "BEEPSTER_KEYCHAIN_HELPER": keychain.path,
                "BEEPSTER_CONTACT_HELPER": Bundle(url: contacts)?.executableURL?.path ?? contacts.path].merging(storeAgents.environment()) { _, new in new })
            return (true, "Beepster runs while the Connector is open. Start at login is controlled in Settings.")
        } catch { return (false, error.localizedDescription) }
#else
        let manager = FileManager.default
        guard let node = currentNodeResource(),
              let gateway = bundledResource("gateway"),
              let keychain = bundledResource("beepster-keychain"),
              let contacts = bundledResource("Beepster Contacts.app") else {
            return (false, "This development build does not contain the standalone gateway resources.")
        }
        let bin = supportDirectory.appendingPathComponent("bin")
        let logs = supportDirectory.appendingPathComponent("logs")
        let installedGateway = supportDirectory.appendingPathComponent("gateway")
        do {
            try manager.createDirectory(at: bin, withIntermediateDirectories: true)
            try manager.createDirectory(at: logs, withIntermediateDirectories: true)
            try manager.createDirectory(at: launchAgentURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try replaceInstalledItem(node, at: bin.appendingPathComponent("node"))
            try replaceInstalledItem(gateway, at: installedGateway)
            let installedKeychain = bin.appendingPathComponent("beepster-keychain")
            if !manager.fileExists(atPath: installedKeychain.path) {
                try manager.copyItem(at: keychain, to: installedKeychain)
            }
            let installedContacts = bin.appendingPathComponent("Beepster Contacts.app")
            try replaceInstalledItem(contacts, at: installedContacts)
            try manager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: bin.appendingPathComponent("node").path)
            try manager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: installedKeychain.path)

            guard ensureSecret("gateway-token", value: randomHex(byteCount: 32)) else {
                return (false, "Could not create the private gateway credential.")
            }
            var pairingBytes = [UInt8](repeating: 0, count: 4)
            guard SecRandomCopyBytes(kSecRandomDefault, pairingBytes.count, &pairingBytes) == errSecSuccess else {
                return (false, "Could not create a pairing code.")
            }
            let randomValue = pairingBytes.reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
            guard ensureSecret("pairing-code", value: String(100000 + randomValue % 900000)) else {
                return (false, "Could not store the one-time pairing code.")
            }

            let plist: [String: Any] = [
                "Label": "org.beepster.gateway",
                "ProgramArguments": [bin.appendingPathComponent("node").path,
                                     installedGateway.appendingPathComponent("src/cli.js").path],
                "WorkingDirectory": installedGateway.path,
                "EnvironmentVariables": [
                    "BEEPSTER_PORT": "8794",
                    "BEEPSTER_KEYCHAIN_HELPER": bin.appendingPathComponent("beepster-keychain").path,
                    "BEEPSTER_CONTACT_HELPER": bin.appendingPathComponent("Beepster Contacts.app").path
                ],
                "RunAtLoad": true,
                "KeepAlive": true,
                "StandardOutPath": logs.appendingPathComponent("gateway.log").path,
                "StandardErrorPath": logs.appendingPathComponent("gateway-error.log").path
            ]
            let previousLaunchAgent = try? Data(contentsOf: launchAgentURL)
            let plistData = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
            try plistData.write(to: launchAgentURL, options: .atomic)
            try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: launchAgentURL.path)
            _ = run("/bin/launchctl", ["bootout", "gui/\(getuid())/org.beepster.gateway"])
            let started = run("/bin/launchctl", ["bootstrap", "gui/\(getuid())", launchAgentURL.path])
            guard started.0 == 0 else {
                if let previousLaunchAgent {
                    try? previousLaunchAgent.write(to: launchAgentURL, options: .atomic)
                    _ = run("/bin/launchctl", ["bootstrap", "gui/\(getuid())", launchAgentURL.path])
                }
                return (false, "The new background gateway could not be started; the previous service was restored.")
            }
            return (true, "The background service is installed and will start at login.")
        } catch {
            return (false, error.localizedDescription)
        }
#endif
    }

    private func replaceInstalledItem(_ source: URL, at destination: URL) throws {
        let manager = FileManager.default
        let parent = destination.deletingLastPathComponent()
        let nonce = UUID().uuidString
        let staged = parent.appendingPathComponent(".\(destination.lastPathComponent).new-\(nonce)")
        let backup = parent.appendingPathComponent(".\(destination.lastPathComponent).old-\(nonce)")
        try manager.copyItem(at: source, to: staged)
        do {
            if manager.fileExists(atPath: destination.path) {
                try manager.moveItem(at: destination, to: backup)
            }
            try manager.moveItem(at: staged, to: destination)
            if manager.fileExists(atPath: backup.path) { try? manager.removeItem(at: backup) }
        } catch {
            if !manager.fileExists(atPath: destination.path), manager.fileExists(atPath: backup.path) {
                try? manager.moveItem(at: backup, to: destination)
            }
            try? manager.removeItem(at: staged)
            throw error
        }
    }

    private func contactsAuthorization() -> String {
#if APP_STORE
        let status = CNContactStore.authorizationStatus(for: .contacts)
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "not_determined"
        @unknown default: return "unknown"
        }
#else
        let helper = contactsHelperPath()
        guard FileManager.default.fileExists(atPath: helper) else { return "helper_missing" }
        let statusFile = FileManager.default.temporaryDirectory
            .appendingPathComponent("beepster-contacts-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: statusFile) }
        let launched = run("/usr/bin/open", ["-n", helper, "--args", "--status-file", statusFile.path])
        guard launched.0 == 0 else { return "unknown" }
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
            if let value = try? String(contentsOf: statusFile, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
                return value
            }
            Thread.sleep(forTimeInterval: 0.05)
        }
        return "unknown"
#endif
    }

    private func gatewayHealth() -> (Bool, String) {
        guard let url = URL(string: "http://127.0.0.1:8794/health") else { return (false, "invalid local address") }
        let semaphore = DispatchSemaphore(value: 0)
        var result = (false, "not running")
        var request = URLRequest(url: url, timeoutInterval: 4)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, response, _ in
            defer { semaphore.signal() }
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let data, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["ok"] as? Bool == true else { return }
            result = object["beeperConfigured"] as? Bool == true
                ? (true, "running; Beeper token configured")
                : (false, "running; Beeper token missing")
        }.resume()
        _ = semaphore.wait(timeout: .now() + 5)
        return result
    }

    private func tailscaleHealth() -> (Bool, String) {
        guard let binary = tailscaleBinary() else {
            return (false, "Tailscale not found")
        }
        let status = run(binary, ["status"])
        guard status.0 == 0 else { return (false, "not connected") }
        return tailscaleServePort(binary) != nil
            ? (true, "connected and forwarding")
            : (false, "connected; Serve route missing")
    }

    private func beeperConnectionHealth() -> (Bool, String) {
        let gateway = gatewayHealth()
        guard gateway.0 else { return gateway }
        let secret = run(keychainHelperPath(), ["get", "gateway-token"], timeout: nil)
        guard secret.0 == 0, !secret.1.isEmpty,
              let url = URL(string: "http://127.0.0.1:8794/v1/chats?limit=1") else {
            return (false, "private credential unavailable")
        }
        let semaphore = DispatchSemaphore(value: 0)
        var result = (false, "could not load conversations")
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(secret.1)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { _, response, _ in
            defer { semaphore.signal() }
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                result = (true, "connected; conversations available")
            }
        }.resume()
        _ = semaphore.wait(timeout: .now() + 9)
        return result
    }

    private func privateRouteHealth() -> (Bool, String) {
        let tailscale = tailscaleHealth()
        guard tailscale.0, var components = phoneSetupURL().flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) }) else {
            return tailscale
        }
        components.path = "/health"
        guard let url = components.url else { return (false, "private address unavailable") }
        let semaphore = DispatchSemaphore(value: 0)
        var result = (false, "route did not reach Beepster")
        var request = URLRequest(url: url, timeoutInterval: 6)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, response, _ in
            defer { semaphore.signal() }
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let data,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  object["ok"] as? Bool == true,
                  object["service"] as? String == "beepster-gateway" else { return }
            guard object["agentProtocol"] as? Int == 1 else {
                result = (false, "Gateway update required. Choose Set up service to install this Connector's gateway, then check again.")
                return
            }
            result = (true, "connected; phone route verified")
        }.resume()
        _ = semaphore.wait(timeout: .now() + 7)
        return result
    }

    private func performChecks() -> (contacts: String, gateway: (Bool, String), route: (Bool, String)) {
        (contactsAuthorization(), beeperConnectionHealth(), privateRouteHealth())
    }

    private func showCheckResults(_ checks: (contacts: String, gateway: (Bool, String), route: (Bool, String)), finishWorking: Bool = true) {
        let contactsOK = checks.contacts == "authorized"
        requirements = [
            ConnectorRequirement("contacts", "Contact names", contactsOK, contactsOK ? "Contacts access enabled." : "Allow Contacts access to display contact names."),
            ConnectorRequirement("beeper", "Beeper connection", checks.gateway.0, checks.gateway.1),
            ConnectorRequirement("route", "Private connection", checks.route.0, checks.route.1),
            mediaAccessRequirement]
#if APP_STORE
        if !serviceConflictMessage.isEmpty {
            requirements.append(ConnectorRequirement("service-owner", "Connector service", false, serviceConflictMessage))
        }
#endif
        setStatus(contactStatus, ok: contactsOK, name: "Contact names",
                  detail: contactsOK ? "enabled" : "permission needs attention")
        setStatus(gatewayStatus, ok: checks.gateway.0, name: "Beeper connection", detail: checks.gateway.1)
        setStatus(tailscaleStatus, ok: checks.route.0, name: "Private connection", detail: checks.route.1)
        let summary = contactsOK && checks.gateway.0 && checks.route.0 ? "Messaging connection ready. Agent setup and physical-watch approval delivery require separate checks below." : "Setup needs attention"
        if finishWorking { setWorking(false, message: summary) }
        else { message = summary; setupSummary?.stringValue = summary }
        checkMediaAccess()
    }

    @objc private func refresh() {
#if APP_STORE
        guard !startingOwnedService else { return }
#endif
        guard !checking, !busy else { return }
        checking = true
        let revision = actionRevision
        DispatchQueue.global(qos: .userInitiated).async {
#if !APP_STORE
            if !self.checkedManagedGateway {
                self.checkedManagedGateway = true
                // Upgrade only this already-installed managed service; retain its
                // LaunchAgent, ports, credentials, contact helper and pairing.
                let health = self.run("/usr/bin/curl", ["-fsS", "--max-time", "3", "http://127.0.0.1:8794/health"])
                if let data = health.1.data(using:.utf8),
                   let object = try? JSONSerialization.jsonObject(with:data) as? [String:Any],
                   object["service"] as? String == "beepster-gateway", object["agentProtocol"] as? Int != 1,
                   FileManager.default.fileExists(atPath:self.launchAgentURL.path), let bundled = self.bundledResource("gateway") {
                    do {
                        try self.replaceInstalledItem(bundled, at:self.supportDirectory.appendingPathComponent("gateway"))
                        _ = self.restartGateway()
                    } catch { /* Readiness remains failed and offers an explicit repair. */ }
                }
            }
#endif
            let checks = self.performChecks()
            let openClaw = self.openClawApprovalHealth()
            var bridgeHealth: [AgentBridgeHealth]?
            if let node = self.currentNodeResource(), let script = self.bundledResource("gateway/src/agent-setup.js") {
                let result = self.run(node.path, [script.path, "--native"], input:"{\"action\":\"health\"}", timeout:30)
                if result.0 == 0, let data = result.1.data(using:.utf8),
                   let state = try? JSONDecoder().decode(AgentSetupState.self, from:data), state.ok {
                    bridgeHealth = state.bridgeHealth
                }
            }
            DispatchQueue.main.async {
                self.checking = false
                guard !self.busy, revision == self.actionRevision else { return }
                self.showCheckResults(checks, finishWorking: false)
                self.updateAgentHealth(bridgeHealth)
                self.setOptionalStatus(self.openClawStatus, state: openClaw.0, detail: openClaw.1)
            }
        }
    }

    @objc private func enableOpenClawApprovals() {
        let existing = run(keychainHelperPath(), ["get", "openclaw-enabled"], timeout: nil)
        if existing.0 == 0 && existing.1.trimmingCharacters(in: .whitespacesAndNewlines) == "enabled" {
            let manage = NSAlert()
            manage.messageText = "OpenClaw approvals are enabled"
            manage.informativeText = "Disabling hides the integration and stops Beepster from connecting to OpenClaw. The local device identity is retained so re-enabling does not require a new identity."
            manage.addButton(withTitle: "Keep Enabled")
            manage.addButton(withTitle: "Disable")
            guard manage.runModal() == .alertSecondButtonReturn else { return }
            setWorking(true, message: "Disabling OpenClaw approvals…")
            DispatchQueue.global(qos: .userInitiated).async {
                _ = self.run(self.keychainHelperPath(), ["set", "openclaw-enabled"], input: "disabled", timeout: nil)
                _ = self.restartGateway()
                DispatchQueue.main.async {
                    self.setOptionalStatus(self.openClawStatus, state: "disabled", detail: "off")
                    self.setWorking(false, message: "OpenClaw approvals are off")
                }
            }
            return
        }
        let warning = NSAlert()
        warning.messageText = "Enable OpenClaw approvals on your watch?"
        warning.informativeText = "This gives Beepster a narrowly scoped OpenClaw operator credential that can view pending protected actions and resolve an exact action as Approve once or Deny inside the matching Telegram chat. Beepster never offers Allow always, and the credential remains on this Mac."
        warning.addButton(withTitle: "Enable Securely")
        warning.addButton(withTitle: "Cancel")
        guard warning.runModal() == .alertFirstButtonReturn else { return }

        setWorking(true, message: "Enabling and pairing OpenClaw approvals…")
        DispatchQueue.global(qos: .userInitiated).async {
            let installed = self.installBundledService()
            guard installed.0 else {
                DispatchQueue.main.async {
                    self.setWorking(false, message: "OpenClaw setup needs attention")
                    let alert = NSAlert(); alert.messageText = "Could not update Beepster"; alert.informativeText = installed.1; alert.runModal()
                }
                return
            }
            let stored = self.run(self.keychainHelperPath(), ["set", "openclaw-enabled"], input: "enabled", timeout: nil)
            _ = self.restartGateway()
            let deadline = Date().addingTimeInterval(10)
            var health = self.openClawApprovalHealth()
            while health.0 != "paired" && Date() < deadline {
                Thread.sleep(forTimeInterval: 0.4)
                health = self.openClawApprovalHealth()
            }
            DispatchQueue.main.async {
                self.setOptionalStatus(self.openClawStatus, state: health.0, detail: health.1)
                self.setWorking(false, message: health.0 == "paired" ? "OpenClaw approvals are ready" : "OpenClaw pairing needs attention")
                let alert = NSAlert()
                if stored.0 != 0 {
                    alert.messageText = "Could not enable OpenClaw approvals"
                    alert.informativeText = "Reinstall Beepster Connector, then try again."
                } else if health.0 == "paired" {
                    alert.messageText = "OpenClaw approvals are ready"
                    alert.informativeText = "Open Agent Links on this Connector's Beepster page to link the agent session to your Telegram chat. Turn on Show pending agent approvals in Beepster Settings on your phone. Requests appear inside the linked chat with a description and Approve once or Deny choices."
                } else {
                    alert.messageText = "Approve Beepster in OpenClaw"
                    alert.informativeText = "Open the OpenClaw app, review the pending Beepster Connector device with its operator.approvals scope, and approve it. Then select Test Everything. No Terminal command is required."
                }
                alert.runModal()
            }
        }
    }

    @objc private func setUpBeepster() {
        setWorking(true, message: "Installing the Mac service…")
        DispatchQueue.global(qos: .userInitiated).async {
            let installed = self.installBundledService()
            guard installed.0 else {
                DispatchQueue.main.async {
                    self.setWorking(false, message: "Setup needs attention")
                    let alert = NSAlert()
                    alert.messageText = "Beepster could not finish setup"
                    alert.informativeText = installed.1
                    alert.runModal()
                }
                return
            }
            let tokenExists = self.run(self.keychainHelperPath(), ["get", "beeper-access-token"], timeout: nil).0 == 0
            DispatchQueue.main.async {
                if tokenExists {
                    self.continueGuidedSetup(token: nil, tokenWasAlreadyStored: true)
                } else if let token = self.promptForBeeperToken() {
                    self.continueGuidedSetup(token: token, tokenWasAlreadyStored: false)
                } else {
                    self.continueGuidedSetup(token: nil, tokenWasAlreadyStored: false)
                }
            }
        }
    }

    private func promptForBeeperToken() -> String? {
        let alert = NSAlert()
        alert.messageText = "Connect Beeper Desktop"
        alert.informativeText = "Follow these steps in Beeper Desktop, then paste the new token below."
        alert.addButton(withTitle: "Save and Continue")
        alert.addButton(withTitle: "Skip for Now")
        let (view, field) = beeperTokenAccessory()
        alert.accessoryView = view
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        let token = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        field.stringValue = ""
        return token.isEmpty ? nil : token
    }

    private func continueGuidedSetup(token: String?, tokenWasAlreadyStored: Bool) {
        setWorking(true, message: "Finishing setup and checking the result…")
        DispatchQueue.global(qos: .userInitiated).async {
            var tokenReady = tokenWasAlreadyStored
            if let token {
                tokenReady = self.run(self.keychainHelperPath(), ["set", "beeper-access-token"], input: token, timeout: nil).0 == 0
            }

            var contacts = self.contactsAuthorization()
            if contacts == "not_determined" {
                self.requestContactsAccess()
                contacts = self.contactsAuthorization()
            }

            var tailscaleConnected = false
            var tailscaleReady = false
            if let binary = self.tailscaleBinary() {
                tailscaleConnected = self.run(binary, ["status"]).0 == 0
            }
            if self.tailscaleBinary() != nil, tailscaleConnected {
                _ = (try? PrivateConnection.start(target: "http://127.0.0.1:8794", port: 10444))
                tailscaleReady = self.tailscaleHealth().0
            }

            _ = self.restartGateway()
            let deadline = Date().addingTimeInterval(8)
            var gateway = self.beeperConnectionHealth()
            while !gateway.0 && Date() < deadline {
                Thread.sleep(forTimeInterval: 0.35)
                gateway = self.beeperConnectionHealth()
            }
            let route = self.privateRouteHealth()
            let checks = (contacts: contacts, gateway: gateway, route: route)

            DispatchQueue.main.async {
                self.showCheckResults(checks)
                if contacts == "authorized" && gateway.0 && route.0 {
                    self.setupSummary.stringValue = "Mac setup complete — connect your phone next"
                } else {
                    var issues: [String] = []
                    if !tokenReady { issues.append("Add the dedicated Beeper Desktop token.") }
                    if contacts != "authorized" { issues.append("Allow Contacts access so names can be shown.") }
                    if !tailscaleConnected {
                        issues.append("Open Tailscale on this Mac and sign in, then run setup again.")
                    } else if !tailscaleReady {
                        issues.append("Tailscale is connected. Select Start Private Route under Advanced options.")
                    } else if !route.0 {
                        issues.append("The Serve route exists but did not reach Beepster. Select Test Everything to retry.")
                    }
                    if tokenReady && !gateway.0 { issues.append("Keep Beeper Desktop open and signed in.") }
                    let alert = NSAlert()
                    alert.messageText = "One more step is needed"
                    alert.informativeText = issues.isEmpty ? "Open Advanced options for repair tools." : issues.joined(separator: "\n")
                    alert.runModal()
                }
            }
        }
    }

    private func requestContactsAccess() {
#if APP_STORE
        // Called only from setup's worker queue. The consent sheet belongs to
        // the Connector; lookup tools inherit its sandbox and privacy context.
        let completed = DispatchSemaphore(value: 0)
        DispatchQueue.main.async {
            if CNContactStore.authorizationStatus(for: .contacts) == .notDetermined {
                let explanation = NSAlert()
                explanation.messageText = "Contact names in Beepster"
                explanation.informativeText = "Beepster can match conversation phone numbers and email addresses to Contacts on this Mac. Matched names are sent with conversations to your paired phone and Pebble watch over your private connection. Your address book is not uploaded to an Organik Apps server. This is optional: without access, Beepster uses names provided by Beeper. You can change access in System Settings."
                explanation.addButton(withTitle: "Continue")
                explanation.addButton(withTitle: "Not Now")
                guard explanation.runModal() == .alertFirstButtonReturn else { completed.signal(); return }
            }
            CNContactStore().requestAccess(for: .contacts) { _, _ in completed.signal() }
        }
        completed.wait()
#else
        _ = run("/usr/bin/open", ["-W", "-n", contactsHelperPath()], timeout: nil)
#endif
    }
    @objc private func enableContacts() {
        DispatchQueue.global(qos: .userInitiated).async {
            self.requestContactsAccess()
            DispatchQueue.main.async { self.refresh() }
        }
    }

    @objc private func installBackgroundService() {
        DispatchQueue.global(qos: .userInitiated).async {
            let result = self.installBundledService()
            DispatchQueue.main.async {
                let alert = NSAlert()
                alert.messageText = result.0 ? "Background service ready" : "Installation needs attention"
                alert.informativeText = result.1
                alert.runModal()
                self.refresh()
            }
        }
    }

    @objc private func openPrivacySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func setBeeperToken() {
        let alert = NSAlert()
        alert.messageText = "Set dedicated Beeper token"
        alert.informativeText = "App updates keep your saved token. Replace it here only if you need to reconnect Beeper. Cancel keeps the current token."
        alert.addButton(withTitle: "Save Token")
        alert.addButton(withTitle: "Cancel")
        let (view, field) = beeperTokenAccessory()
        alert.accessoryView = view
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let token = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        field.stringValue = ""
        guard !token.isEmpty else { return }
        let keychain = keychainHelperPath()
        DispatchQueue.global(qos: .userInitiated).async {
            let stored = self.run(keychain, ["set", "beeper-access-token"], input: token, timeout: nil)
            _ = self.restartGateway()
            DispatchQueue.main.async {
                if stored.0 != 0 {
                    let failure = NSAlert()
                    failure.messageText = "Token could not be stored"
                    failure.informativeText = "Reinstall the companion, then try again."
                    failure.runModal()
                }
                self.refresh()
            }
        }
    }

    private func beeperTokenAccessory() -> (NSView, NSSecureTextField) {
        let instructions = wrappingLabel("""
        1. Open Beeper Desktop and select the gear icon for Settings.
        2. Select Integrations in the left sidebar.
        3. Turn on Allow connections.
        4. Find Approved connections and select the + button.
        5. Enter Beepster as the name and set Expires In to Never.
        6. Turn on Allow sensitive actions. This is required to send replies.
        7. Select Create Access Token, copy the token, and paste it below.

        The token is shown only when it is created. Beepster stores it only in your Mac login Keychain.
        """)
        instructions.font = .systemFont(ofSize: 13)
        instructions.maximumNumberOfLines = 0

        let openBeeper = button("Open Beeper Desktop", #selector(openBeeperDesktop))
        openBeeper.bezelStyle = .rounded

        let pasteLabel = NSTextField(labelWithString: "Paste the new token here:")
        pasteLabel.font = .systemFont(ofSize: 13, weight: .semibold)

        let field = NSSecureTextField()
        field.placeholderString = "Paste Beeper Desktop API token"

        // NSAlert sizes its accessory from its frame. A zero-frame stack with
        // Auto Layout disabled at the alert boundary overlaps the alert text.
        let width: CGFloat = 440
        let accessory = NSView(frame: NSRect(x: 0, y: 0, width: width, height: 360))
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.borderType = .noBorder
        scroll.drawsBackground = false
        let text = NSTextView(frame: NSRect(x: 0, y: 0, width: width, height: 230))
        text.string = instructions.stringValue
        text.font = .systemFont(ofSize: 13)
        text.textColor = .labelColor
        text.isEditable = false
        text.drawsBackground = false
        text.isHorizontallyResizable = false
        text.isVerticallyResizable = true
        text.autoresizingMask = [.width]
        text.textContainerInset = NSSize(width: 0, height: 4)
        text.textContainer?.widthTracksTextView = true
        scroll.documentView = text
        let stack = NSStackView(views: [scroll, openBeeper, pasteLabel, field])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        accessory.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: accessory.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: accessory.trailingAnchor),
            stack.topAnchor.constraint(equalTo: accessory.topAnchor),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: accessory.bottomAnchor),
            scroll.widthAnchor.constraint(equalTo: stack.widthAnchor),
            scroll.heightAnchor.constraint(equalToConstant: 230),
            field.widthAnchor.constraint(equalTo: stack.widthAnchor),
            field.heightAnchor.constraint(equalToConstant: 24)
        ])
        accessory.layoutSubtreeIfNeeded()
        return (accessory, field)
    }

    @objc private func openBeeperDesktop() {
        let workspace = NSWorkspace.shared
        let appURL = workspace.urlForApplication(withBundleIdentifier: "com.automattic.beeper.desktop")
            ?? URL(fileURLWithPath: "/Applications/Beeper Desktop.app")
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = true
        workspace.openApplication(at: appURL, configuration: configuration)
    }

    @objc private func startPrivateRoute() {
        guard tailscaleBinary() != nil else {
            if let url = URL(string: "https://tailscale.com/download/mac") {
                NSWorkspace.shared.open(url)
            }
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            _ = (try? PrivateConnection.start(target: "http://127.0.0.1:8794", port: 10444))
            DispatchQueue.main.async { self.refresh() }
        }
    }

    @objc private func connectPhone() {
        setWorking(true, message: "Preparing phone setup…")
        DispatchQueue.global(qos: .userInitiated).async {
            let route = self.privateRouteHealth()
            let url = route.0 ? self.phoneSetupURL() : nil
            let pairing = self.run(self.keychainHelperPath(), ["get", "pairing-code"], timeout: nil)
            DispatchQueue.main.async {
                self.setWorking(false, message: route.0 ? "Phone setup is ready" : "Setup needs attention")
                guard let url, pairing.0 == 0, !pairing.1.isEmpty else {
                    let alert = NSAlert()
                    alert.messageText = "Phone setup is not ready yet"
                    alert.informativeText = route.1 == "not connected"
                        ? "Open Tailscale and sign in, then try again."
                        : (route.1 == "connected; Serve route missing"
                            ? "Tailscale is connected. Select Start Private Route under Advanced options, then try again."
                            : "Select Test Everything to identify the remaining setup problem.")
                    alert.runModal()
                    return
                }

                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(url.absoluteString, forType: .string)

                let instructions = self.wrappingLabel("1. On your phone, open Pebble → Beepster → Settings.\n2. Paste the private address (already copied).\n3. Enter the pairing code, then test and save.")
                instructions.font = .systemFont(ofSize: 13)
                let addressLabel = NSTextField(labelWithString: "Private address")
                addressLabel.font = .systemFont(ofSize: 12, weight: .semibold)
                let address = NSTextField(frame: NSRect(x: 0, y: 0, width: 440, height: 24))
                address.stringValue = url.absoluteString
                address.isEditable = false
                address.isSelectable = true
                address.lineBreakMode = .byTruncatingMiddle
                let codeLabel = NSTextField(labelWithString: "Pairing code: \(pairing.1)")
                codeLabel.font = .monospacedDigitSystemFont(ofSize: 20, weight: .semibold)
                let details = NSStackView(views: [instructions, addressLabel, address, codeLabel])
                details.orientation = .vertical
                details.alignment = .leading
                details.spacing = 8
                details.widthAnchor.constraint(equalToConstant: 440).isActive = true

                let alert = NSAlert()
                alert.messageText = "Connect Beepster on your phone"
                alert.informativeText = "Everything you need is together here. The address is on your clipboard."
                alert.accessoryView = details
                alert.addButton(withTitle: "Done")
                alert.runModal()
            }
        }
    }

    @objc private func copyPhoneSetup() {
        guard tailscaleHealth().0, let url = phoneSetupURL() else {
            let alert = NSAlert()
            alert.messageText = "Private setup address unavailable"
            let tailscale = tailscaleHealth()
            alert.informativeText = tailscale.1 == "not connected"
                ? "Open Tailscale and sign in, then try again."
                : "Tailscale is connected. Select Start Private Route under Advanced options, then try again."
            alert.runModal()
            return
        }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.absoluteString, forType: .string)
        let alert = NSAlert()
        alert.messageText = "Phone setup address copied"
        alert.informativeText = "On your phone, open Pebble → Beepster → Settings and paste the address. If Universal Clipboard is unavailable, the selectable address is shown below. Keep it private."
        let address = NSTextField(frame: NSRect(x: 0, y: 0, width: 430, height: 24))
        address.stringValue = url.absoluteString
        address.isEditable = false
        address.isSelectable = true
        address.lineBreakMode = .byTruncatingMiddle
        alert.accessoryView = address
        alert.runModal()
    }

    @objc private func showPairingCode() {
        let helper = keychainHelperPath()
        let value = run(helper, ["get", "pairing-code"], timeout: nil).1
        let alert = NSAlert()
        alert.messageText = value.isEmpty ? "Pairing code unavailable" : "Pairing code: \(value)"
        alert.informativeText = value.isEmpty
            ? "Reinstall the companion to generate a new one-time code."
            : "Enter this one-time code in Beepster Settings on your phone."
        alert.runModal()
    }

    @objc private func openInstallGuide() {
        if let url = URL(string: "https://github.com/GeezusChrotch/beepster/blob/main/docs/INSTALL.md") {
            NSWorkspace.shared.open(url)
        }
    }
}
