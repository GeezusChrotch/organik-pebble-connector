import AppKit
import SwiftUI
import Security
import LocalAuthentication

@MainActor final class PomeCameraService: ObservableObject {
    @Published var enabled = UserDefaults.standard.bool(forKey: "pome.cameras.enabled") {
        didSet { revision += 1; UserDefaults.standard.set(enabled, forKey: "pome.cameras.enabled"); control(enabled ? "start" : "pause") }
    }
    @Published var tokenInput = ""
    @Published var message = "Start the Pome connection, then allow access to Apple Home."
    @Published var origin = ""
    @Published var busy = false
    @Published var cameras: [PomeCameraItem] = []
    @Published var selectedCameraID = ""
    @Published var preview: NSImage?
    @Published var previewStatus = "Choose a camera to see its latest image."
    @Published var captureBusy = false
    private var captureTask: Task<Void, Never>?
    private var launching = false
    var captureSupported: Bool {
        if #available(macOS 15.2, *) { return true }
        return false
    }
    @Published private var completedInitialCheck = false
    private var launchTask: Task<Void, Never>?
    private var quitting = false
#if APP_STORE
    private var ownerToken = ""
    private var cameraToken = ""
#endif
    @Published private var health = PomeCameraHealth([:])
    @Published private var homeHealth = PomeHomeHealth([:], status: 0)
    @Published private var privateReady = false
    private var checking = false
    private var checkPending = false
    private var revision = 0
    private let target = "http://127.0.0.1:7855"
    var running: Bool { health.running }
    func start() {
        guard !launching, !quitting else { return }
        guard let app = Bundle.main.resourceURL?.appendingPathComponent("Pome Cameras.app"), FileManager.default.fileExists(atPath: app.path) else {
            message = "The Pome service is missing. Install the updated Connector."; return
        }
        launching = true
        launchTask = Task {
            defer { launching = false; completedInitialCheck = true }
            do {
                let configuration = NSWorkspace.OpenConfiguration(); configuration.activates = false
                _ = try await NSWorkspace.shared.openApplication(at: app, configuration: configuration)
                for _ in 0..<15 {
                    guard !quitting else { return }
                    if await connectLocalCameraService() { return }
                    try await Task.sleep(nanoseconds: 300_000_000)
                }
                message = "Pome setup could not start. Try Start Pome connection again."
            } catch { message = "Pome setup could not start. Try again." }
        }
    }
    func setUpHome() {
        start()
        Task {
            await launchTask?.value
            if health.valid && !health.home { control("home") }
        }
    }
    func prepareToQuit() async {
        quitting = true
        await launchTask?.value
#if APP_STORE
        // A launch may have completed while Quit was requested. Wait briefly
        // for its private owner credential before asking that helper to stop.
        for _ in 0..<6 {
            if await connectLocalCameraService() { break }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
#endif
        shutdown()
    }
    func shutdown() {
        revision += 1; captureTask?.cancel(); captureBusy = false
        guard let helper = Bundle.main.resourceURL?.appendingPathComponent("Pome Cameras.app").standardizedFileURL else { return }
#if APP_STORE
        if NSRunningApplication.runningApplications(withBundleIdentifier: "com.organikapps.pome.camera-probe").contains(where: { $0.bundleURL?.standardizedFileURL == helper }),
           !ownerToken.isEmpty, let secret = try? token(), let url = URL(string: target + "/service/quit") {
            var request = URLRequest(url: url, timeoutInterval: 2)
            request.httpMethod = "POST"
            request.setValue("Bearer " + secret, forHTTPHeaderField: "Authorization")
            request.setValue(ownerToken, forHTTPHeaderField: "X-Organik-Camera-Owner")
            let completed = DispatchSemaphore(value: 0)
            let task = URLSession.shared.dataTask(with: request) { _, _, _ in completed.signal() }
            task.resume()
            if completed.wait(timeout: .now() + 2.5) == .timedOut { task.cancel() }
        }
#else
        for app in NSRunningApplication.runningApplications(withBundleIdentifier: "com.organikapps.pome.camera-probe") where app.bundleURL?.standardizedFileURL == helper { app.terminate() }
#endif
        health = PomeCameraHealth([:]); homeHealth = PomeHomeHealth([:], status: 0); preview = nil
    }
    @discardableResult func connectLocalCameraService() async -> Bool {
        do {
            let file: URL
            if let group = Bundle.main.object(forInfoDictionaryKey: "OrganikCameraAppGroup") as? String {
                guard let shared = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
                    throw ConnectorError(message: "The shared camera connection is unavailable. Check this app’s signing configuration.")
                }
                file = shared.appendingPathComponent("cache-connection.json")
            } else {
#if APP_STORE
                throw ConnectorError(message: "The shared camera connection is not configured in this build.")
#else
                file = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Containers/com.organikapps.pome.camera-probe/Data/Documents/cache-connection.json")
#endif
            }
            let data = try Data(contentsOf: file)
            guard let value = try JSONSerialization.jsonObject(with: data) as? [String: String],
                  let secret = value["token"], !secret.isEmpty else { throw ConnectorError(message: "Open camera setup first to create its connection token.") }
            let response = try await jsonRequest(URL(string: target + "/health")!, token: secret)
            guard PomeCameraHealth(response).valid else { throw ConnectorError(message: "Start the updated camera service before connecting.") }
#if APP_STORE
            if let savedOwner = value["ownerToken"], !savedOwner.isEmpty { ownerToken = savedOwner }
            // The helper persists this credential and shares it through our
            // entitled App Group. Avoid a second Keychain authorization path.
            cameraToken = secret
            revision += 1
            await check()
#else
            tokenInput = secret
            await saveAndCheck()
#endif
            return true
        } catch { return false }
    }
    private var credentialQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "org.organikapps.pebble.pome-cameras", kSecAttrAccount as String: "camera-token"]
    }
    func sharedG2Credential() throws -> String { try token() }
    private func token() throws -> String {
#if APP_STORE
        guard !cameraToken.isEmpty else { throw ConnectorError(message: "Start the camera connection to load its shared credential.") }
        return cameraToken
#else
        var query = credentialQuery
        query[kSecReturnData as String] = true
        let context = LAContext(); context.interactionNotAllowed = true
        query[kSecUseAuthenticationContext as String] = context
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data, let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            throw ConnectorError(message: "Paste the camera service token and choose Save and check.")
        }
        return token
#endif
    }
    func saveAndCheck() async {
        let value = tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty {
            guard value.count <= 512, !value.contains(where: { $0.isWhitespace }) else { message = "Paste the connection token without spaces."; return }
#if APP_STORE
            cameraToken = value
#else
            let data = Data(value.utf8)
            var status = SecItemUpdate(credentialQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            if status == errSecItemNotFound {
                var item = credentialQuery; item[kSecValueData as String] = data
                item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                status = SecItemAdd(item as CFDictionary, nil)
            }
            guard status == errSecSuccess else { message = "Unlock your login Keychain and try saving again."; return }
#endif
            tokenInput = ""; revision += 1
        }
        await check()
    }
    func check() async {
        guard !busy else { return }
        if checking { checkPending = true; return }
        checking = true
        defer {
            checking = false
            if !launching { completedInitialCheck = true }
            if checkPending { checkPending = false; Task { await self.check() } }
        }
        let current = revision
        do {
            let secret = try token()
            let result = try await jsonRequest(URL(string: target + "/health")!, token: secret)
            guard current == revision else { return }
            health = PomeCameraHealth(result)
            guard health.valid else { throw ConnectorError(message: "Update the camera service; its health protocol is not supported.") }
            let localHome = await fetchHomeHealth(origin: target, secret: secret)
            guard current == revision else { return }
            homeHealth = localHome
            let configuration = await Task.detached { try? PrivateConnection.configuration() }.value
            guard current == revision else { return }
            origin = configuration.flatMap { PrivateConnection.origin(target: target, configuration: $0) } ?? ""
            var routeReady = false
            // Reachability is independent of Home authorization/loading.
            if let url = URL(string: origin + "/health"), !origin.isEmpty {
                let response = try? await jsonRequest(url, token: secret)
                routeReady = response.map { PomeCameraHealth($0).valid } ?? false
            }
            guard current == revision else { return }
            privateReady = routeReady
            let list = try await jsonRequest(URL(string: target + "/camera-settings")!, token: secret)
            guard current == revision else { return }
            cameras = (list["cameras"] as? [[String: Any]] ?? []).compactMap(PomeCameraItem.init)
            if !cameras.contains(where: { $0.id == selectedCameraID }) { selectedCameraID = cameras.first(where: { $0.interval >= 0 })?.id ?? "" }
            message = homeHealth.ready ? "Pome connection ready. Home controls continue with this window closed; quitting Connector stops the connection." : homeHealth.detail

        } catch {
            guard current == revision else { return }
            health = PomeCameraHealth([:]); homeHealth = PomeHomeHealth([:], status: 0); privateReady = false; origin = ""
            message = error.localizedDescription
        }
    }
    private func fetchHomeHealth(origin: String, secret: String) async -> PomeHomeHealth {
        guard let url = URL(string: origin + "/home/status") else { return PomeHomeHealth([:], status: 0) }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.setValue("Bearer " + secret, forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            return PomeHomeHealth(value, status: (response as? HTTPURLResponse)?.statusCode ?? 0)
        } catch { return PomeHomeHealth([:], status: 0) }
    }
    func startPrivateConnection() {
        guard !busy, health.valid else { return }
        busy = true; revision += 1
        Task {
            do {
                let target = target
                _ = try await Task.detached { try PrivateConnection.start(target: target, port: 10550) }.value
                busy = false; await check()
            } catch { busy = false; message = error.localizedDescription }
        }
    }
    func control(_ action: String) {
        guard ["start", "pause", "home"].contains(action), !busy else { return }
        busy = true; revision += 1
        Task {
            do { _ = try await jsonRequest(URL(string: target + "/service/" + action)!, token: token(), body: [:]) }
            catch { message = error.localizedDescription }
            busy = false; await check()
        }
    }
    func setInterval(_ value: Int) {
        guard [-1, 0, 15, 30, 60, 300, 900, 3600].contains(value), UUID(uuidString: selectedCameraID) != nil, !busy else { return }
        let id = selectedCameraID; busy = true; revision += 1
        Task {
            do { _ = try await jsonRequest(URL(string: target + "/schedule/" + id + "?interval=\(value)")!, token: token(), body: [:]) }
            catch { message = error.localizedDescription }
            busy = false; await check()
        }
    }
    func loadPreview() async {
        let id = selectedCameraID
        guard UUID(uuidString: id) != nil else { return }
        do {
            let result = try await jsonRequest(URL(string: target + "/frame/" + id + "?platform=emery&mode=natural")!, token: token())
            guard id == selectedCameraID else { return }
            preview = decodePomeCameraPreview(result)
            previewStatus = preview == nil ? "The camera image could not be decoded." : "Image captured \(result["age"] as? Int ?? 0) seconds ago."
        } catch { if id == selectedCameraID { preview = nil; previewStatus = "No image yet. Choose Capture now." } }
    }
    func captureNow() {
        let id = selectedCameraID
        guard !captureBusy, UUID(uuidString: id) != nil else { return }
        captureBusy = true; previewStatus = "Capturing a fresh image…"
        captureTask = Task {
            defer { captureBusy = false }
            do {
                let secret = try token()
                let request = try await jsonRequest(URL(string: target + "/refresh/" + id)!, token: secret, body: [:])
                guard let ticket = request["requestID"] as? String, UUID(uuidString: ticket) != nil else { throw ConnectorError(message: "Capture could not start.") }
                for _ in 0..<35 {
                    try Task.checkCancellation()
                    let result = try await jsonRequest(URL(string: target + "/capture/" + id + "?request=" + ticket)!, token: secret)
                    if result["state"] as? String == "ready" { if id == selectedCameraID { await loadPreview() }; return }
                    if result["state"] as? String == "failed" { throw ConnectorError(message: result["error"] as? String ?? "Capture failed. Try again.") }
                    try await Task.sleep(nanoseconds: 1_000_000_000)
                }
                throw ConnectorError(message: "Capture timed out. Try again.")
            } catch { if id == selectedCameraID { previewStatus = error.localizedDescription } }
        }
    }
    func copyToken() {
        do {
            let value = try token()
            NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string)
            let generation = NSPasteboard.general.changeCount
            DispatchQueue.main.asyncAfter(deadline: .now() + 120) {
                if NSPasteboard.general.changeCount == generation { NSPasteboard.general.clearContents() }
            }
        }
        catch { message = error.localizedDescription }
    }
    var homeRequirements: [ConnectorRequirement] {
        [ConnectorRequirement("service", "Pome service", health.valid, "Choose Connect Apple Home to start the built-in service."),
         ConnectorRequirement("home-permission", "Home access", health.home, "Choose Connect Apple Home and allow access when macOS asks."),
         ConnectorRequirement("home-ready", "Apple Home", homeHealth.ready, homeHealth.detail),
         ConnectorRequirement("route", "Private connection", privateReady, "Connect Tailscale on Mac and phone, then start the private connection.")]
    }
    var requirements: [ConnectorRequirement] {
        guard enabled else { return [] }
        return [ConnectorRequirement("camera-running", "Camera captures", health.running, "Choose Resume captures."),
                ConnectorRequirement("camera-capture", "Camera capture supported", health.capture, "Cameras require macOS 15.2 or newer."),
                ConnectorRequirement("camera-selection", "Cameras enabled", health.cameras, "Choose a camera and select On demand or a refresh interval.")]
    }
    var overviewRequirements: [ConnectorRequirement] {
        let loading = !completedInitialCheck || launching
        var checks = homeRequirements.map { ConnectorRequirement($0.id, $0.title, $0.ready, $0.detail, checking: loading) }
        if enabled {
            checks.append(ConnectorRequirement("cameras", "Cameras", requirements.allSatisfy(\.ready),
                requirements.filter { !$0.ready }.map(\.title).joined(separator: ", "), checking: loading))
        }
        return checks
    }
}

struct PomeSetupView: View {
    @ObservedObject var service: PomeCameraService
    var body: some View {
        ConnectorDetail(page: .pome, requirements: service.homeRequirements + service.requirements, busy: service.busy, message: service.message) {
            SetupStep(number: 1, title: "Connect Apple Home", detail: "Pome connects directly to your Apple Home through this Connector. Sign in to iCloud and set up your home in Apple Home first. Connect Apple Home starts the built-in connection and requests permission to read your home and control its accessories.") {
                HStack {
                    Button("Connect Apple Home") { service.setUpHome() }.buttonStyle(.borderedProminent).disabled(service.busy)
                }
            }
            SetupStep(number: 2, title: "Connect Mac and phone privately", detail: "Keep this Mac running for home controls and cameras. Closing the window keeps Pome connected; quitting Connector stops the connection.") {
                PrivateSetupHelp()
                Button("Start private connection") { service.startPrivateConnection() }.disabled(service.busy)
            }
            SetupStep(number: 3, title: "Connect Pome on your phone", detail: "In Pebble → Pome → Settings → Setup, paste the Pome URL and token, choose your favorite scenes, then save. The same connection serves home controls and cameras.") {
                if !service.origin.isEmpty { Text(service.origin).textSelection(.enabled) }
                HStack {
                    Button("Copy Pome URL") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(service.origin, forType: .string) }.disabled(service.origin.isEmpty)
                    Button("Copy Pome token") { service.copyToken() }
                }
            }
            Button("Check connection") { Task { await service.check() } }.disabled(service.busy)
            DisclosureGroup("Optional: Cameras") {
                PomeCameraSetup(service: service)
            }
        } troubleshooting: {
            HStack {
                Button("Start Pome connection") { service.start() }
                Button("Allow Home access") { service.control("home") }.disabled(service.busy)
            }
            Text("If Home access is denied, allow Pome Cameras in System Settings → Privacy & Security → HomeKit. If Apple Home is loading, open Apple Home and confirm your home is available, then check again. An older helper needs the updated Connector. For phone connection problems, check Tailscale on both devices and copy the shared Pome connection again.")
        }
    }
}

struct PomeCameraSetup: View {
    @ObservedObject var service: PomeCameraService
    var body: some View {
        GroupBox("Cameras") {
            VStack(alignment: .leading, spacing: 12) {
                Toggle("Use cameras with Pome", isOn: $service.enabled)
                    .disabled(service.busy || (!service.captureSupported && !service.enabled))
                if !service.captureSupported {
                    Text("Cameras require macOS 15.2 or newer. Apple Home controls remain available.").font(.callout)
                }
                if service.enabled && service.captureSupported {
                    HStack {
                        Button(service.running ? "Pause captures" : "Resume captures") { service.control(service.running ? "pause" : "start") }.disabled(service.busy)
                    }
                    Text("Pausing cameras keeps Apple Home controls connected. Camera capture continues with this window closed; quitting Connector stops it.").font(.caption).foregroundStyle(.secondary)
                    if !service.cameras.isEmpty {
                        Picker("Camera", selection: $service.selectedCameraID) {
                            ForEach(service.cameras) { Text($0.name).tag($0.id) }
                        }.onChange(of: service.selectedCameraID) { _, _ in Task { await service.loadPreview() } }
                        Picker("Refresh", selection: Binding(get: { service.cameras.first { $0.id == service.selectedCameraID }?.interval ?? 0 }, set: { service.setInterval($0) })) {
                            Text("Hidden").tag(-1); Text("On demand").tag(0); Text("Every 15 seconds").tag(15); Text("Every 30 seconds").tag(30)
                            Text("Every minute").tag(60); Text("Every 5 minutes").tag(300); Text("Every 15 minutes").tag(900); Text("Every hour").tag(3600)
                        }.disabled(service.busy)
                        Text("Frequent captures wake the camera. Use On demand or a longer interval for battery cameras.").font(.caption).foregroundStyle(.secondary)
                        if let preview = service.preview { Image(nsImage: preview).resizable().interpolation(.none).scaledToFit().frame(maxHeight: 280).accessibilityLabel("Latest camera snapshot") }
                        HStack {
                            Button("Capture now") { service.captureNow() }.disabled(service.captureBusy || !service.running)
                            Button("Show latest image") { Task { await service.loadPreview() } }
                            Text(service.previewStatus).font(.caption)
                        }
                    }
                    Text(service.message).font(.caption).foregroundStyle(.secondary)
                    ForEach(service.requirements) { RequirementLight(requirement: $0) }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
