import AppKit
import SwiftUI
import Security
import LocalAuthentication

@MainActor final class PomeCameraService: ObservableObject {
    @Published var enabled = UserDefaults.standard.bool(forKey: "pome.cameras.enabled") {
        didSet { revision += 1; UserDefaults.standard.set(enabled, forKey: "pome.cameras.enabled"); if enabled { start() } else { shutdown() } }
    }
    @Published var tokenInput = ""
    @Published var message = "Connect your camera service to check Home access and camera availability."
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
    @Published private var privateReady = false
    private var checking = false
    private var checkPending = false
    private var revision = 0
    private let target = "http://127.0.0.1:7855"
    var running: Bool { health.running }
    func start() {
        guard captureSupported else { message = "Pome cameras require macOS 15.2 or newer. Home controls remain available through Itsyhome."; return }
        guard enabled, !launching, !quitting else { return }
        guard let app = Bundle.main.resourceURL?.appendingPathComponent("Pome Cameras.app"), FileManager.default.fileExists(atPath: app.path) else {
            message = "The camera service is missing. Install a camera-enabled Connector build."; return
        }
        launching = true
        launchTask = Task {
            defer { launching = false }
            do {
                let configuration = NSWorkspace.OpenConfiguration(); configuration.activates = false
                _ = try await NSWorkspace.shared.openApplication(at: app, configuration: configuration)
                for _ in 0..<15 {
                    guard enabled, !quitting else { return }
                    if await connectLocalCameraService() { return }
                    try await Task.sleep(nanoseconds: 300_000_000)
                }
                message = "Camera setup could not start. Try Start camera connection again."
            } catch { message = "Camera setup could not start. Try again." }
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
        health = PomeCameraHealth([:]); preview = nil
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
        guard enabled, !busy else { return }
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
            let configuration = await Task.detached { try? PrivateConnection.configuration() }.value
            guard current == revision else { return }
            origin = configuration.flatMap { PrivateConnection.origin(target: target, configuration: $0) } ?? ""
            var routeReady = false
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
            message = health.home ? "Camera connection ready. Capture continues with this window closed; quitting Connector stops it." : "Choose Allow Home access to connect your cameras."

        } catch {
            guard current == revision else { return }
            health = PomeCameraHealth([:]); privateReady = false; origin = ""
            message = error.localizedDescription
        }
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
    var requirements: [ConnectorRequirement] {
        guard enabled else { return [] }
        return [ConnectorRequirement("camera-service", "Camera service", health.valid, "Choose Start camera connection."),
                ConnectorRequirement("camera-home", "Camera Home access", health.home, "Choose Allow Home access here."),
                ConnectorRequirement("camera-running", "Camera service started", health.running, "Choose Resume captures."),
                ConnectorRequirement("camera-capture", "Camera capture supported", health.capture, "The camera service requires a compatible macOS version."),
                ConnectorRequirement("camera-selection", "Cameras enabled", health.cameras, "Choose a camera and select On demand or a refresh interval."),
                ConnectorRequirement("camera-route", "Private camera connection", privateReady, "Start the private camera connection, then check again.")]
    }
    var overviewRequirements: [ConnectorRequirement] {
        guard enabled else { return [] }
        let checks = requirements
        return [ConnectorRequirement("cameras", "Cameras", checks.allSatisfy(\.ready),
            checks.filter { !$0.ready }.map(\.title).joined(separator: ", "), checking: captureSupported && (!completedInitialCheck || launching))]
    }
}

struct PomeCameraSetup: View {
    @ObservedObject var service: PomeCameraService
    var body: some View {
        GroupBox("Cameras") {
            VStack(alignment: .leading, spacing: 12) {
                Toggle("Use cameras with Pome", isOn: $service.enabled)
                    .disabled(!service.captureSupported && !service.enabled)
                if !service.captureSupported {
                    Text("Cameras require macOS 15.2 or newer. You can still use Pome home controls through Itsyhome.").font(.callout)
                }
                if service.enabled && service.captureSupported {
                    HStack {
                        Button("Start camera connection") { service.start() }
                        Button("Allow Home access") { service.control("home") }.disabled(service.busy)
                        Button(service.running ? "Pause captures" : "Resume captures") { service.control(service.running ? "pause" : "start") }.disabled(service.busy)
                    }
                    Text("Camera capture continues while Connector is minimized or its window is closed. Quit stops captures. Start at login follows your existing Connector setting.").font(.caption).foregroundStyle(.secondary)
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
                    Button("Start private camera connection") { service.startPrivateConnection() }.disabled(service.busy)
                    Text("In Pebble → Pome → Settings → Cameras, paste the camera address and token, then save and refresh Cameras on your watch.")
                    HStack {
                        Button("Copy camera address") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(service.origin, forType: .string) }.disabled(service.origin.isEmpty)
                        Button("Copy camera token") { service.copyToken() }
                    }
                    Text(service.message).font(.caption).foregroundStyle(.secondary)
                    ForEach(service.requirements) { RequirementLight(requirement: $0) }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
