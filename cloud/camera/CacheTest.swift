import UIKit
import HomeKit
import JavaScriptCore
#if targetEnvironment(macCatalyst)
import ScreenCaptureKit
#endif

private struct WatchPixels {
    let width: Int, height: Int
    let data: Data
    var json: [String: Any] { ["width": width, "height": height, "encoding": "gcolor6", "pixels": packCameraPixels(data).base64EncodedString()] }
}
private final class CachedCamera {
    let id = UUID().uuidString
    var frames: [String: WatchPixels]
    let sourceImage: CGImage
    let snapshotAt: Date, preparedAt: Date
    let duration: Double
    init(frames: [String: WatchPixels], sourceImage: CGImage, snapshotAt: Date, preparedAt: Date, duration: Double) {
        self.frames = frames; self.sourceImage = sourceImage; self.snapshotAt = snapshotAt; self.preparedAt = preparedAt; self.duration = duration
    }
}

// Everything runs on the main queue; one HomeKit request/render job at a time.
// Retain nine successful snapshots per camera, each with watch/mode variants.
final class CameraCacheController: UIViewController, HMHomeManagerDelegate, HMCameraSnapshotControlDelegate, HMCameraStreamControlDelegate, UITableViewDataSource, UITableViewDelegate {
    private let table = UITableView()
    private let status = UILabel()
    private var source = HMCameraView()
    private let processed = UIImageView()
    private let marker = UIView()
    private let toggle = UIButton(type: .system)
    private var manager: HMHomeManager?
    private lazy var homeControl = HomeControl(manager: { [weak self] in self?.manager })
    private var cameras: [HMAccessory] = []
    private var schedules: [String: CameraSchedule] = [:]
    private var cache: [String: CachedCamera] = [:]
    private var history: [String: [CachedCamera]] = [:]
    private var errors: [String: String] = [:]
    private var manual: [String] = []
    private var manualTickets: [String: String] = [:]
    private var manualRequestedAt: [String: Date] = [:]
    private var captureResults: [String: [String: Any]] = [:]
    private var activeID: String?
    private var jobToken = UUID()
    private var jobStart = Date()
    private var activeControl: HMCameraSnapshotControl?
    private var activeStream: HMCameraStreamControl?
    private var quarantined = Set<String>()
    private var pendingSnapshots = Set<String>()
    private var timer: Timer?
    private var running = false
    private var server: CacheHTTP?
    private var quantizer: JSContext?
    private var sourceRatio = 16.0 / 9.0
    private var markerWhite = false
    private var lastCaptureOnScreen: Bool?
    private var token = ""
    // A fresh launch credential shared only with the entitled owning Connector.
    private let ownerToken = UUID().uuidString + UUID().uuidString
    private var connectionStatus = "Starting local service"
    private let prefsKey = "camera-cache-schedules-v1"
    private let enabledKey = "camera-service-enabled-v1"

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Pome Cameras"
        view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItems = [
            UIBarButtonItem(title: "Allow Home access", style: .plain, target: self, action: #selector(connectHome)),
            UIBarButtonItem(title: "Copy connection token", style: .plain, target: self, action: #selector(copyConnectionToken))
        ]
        status.numberOfLines = 0
        status.font = .systemFont(ofSize: 13)
        toggle.setTitle("Start cache", for: .normal)
        toggle.addTarget(self, action: #selector(toggleCache), for: .touchUpInside)
        table.dataSource = self; table.delegate = self
        processed.contentMode = .scaleAspectFit
        marker.backgroundColor = .black
        [status, toggle, table, source, processed, marker].forEach(view.addSubview)
        if let data = UserDefaults.standard.data(forKey: prefsKey), let stored = try? JSONDecoder().decode([String: CameraSchedule].self, from: data) {
            schedules = stored.mapValues { var s = $0; s.nextDue = 0; s.failures = 0; return s }
        }
        do {
            let file = try documents().appendingPathComponent("cache-connection.json")
            if let data = try? Data(contentsOf: file), let json = try? JSONSerialization.jsonObject(with: data) as? [String: String], let saved = json["token"] { token = saved }
            else {
                token = UUID().uuidString + UUID().uuidString
                let data = try JSONSerialization.data(withJSONObject: ["token": token, "localURL": "http://127.0.0.1:7855"])
                try data.write(to: file, options: .atomic)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            }
            // Publish the existing token through an entitled App Group for the
            // sandboxed Connector. The helper retains its own token/preferences.
            if let group = Bundle.main.object(forInfoDictionaryKey: "OrganikCameraAppGroup") as? String {
                guard let shared = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
                    throw NSError(domain: "CameraAppGroup", code: 1, userInfo: [NSLocalizedDescriptionKey: "Shared camera container is unavailable."])
                }
                let connection = shared.appendingPathComponent("cache-connection.json")
                let data = try JSONSerialization.data(withJSONObject: ["token": token, "localURL": "http://127.0.0.1:7855",
                    "ownerToken": ownerToken])
                try data.write(to: connection, options: .atomic)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: connection.path)
            }
            let context = JSContext()!
            context.evaluateScript("var module={exports:{}};")
            let js = try String(contentsOf: Bundle.main.url(forResource: "pebble-image", withExtension: "cjs")!)
            // Same palette, contrast and full-image error diffusion; only widen
            // the shared function's input-size guard for native-height panoramas.
            guard js.components(separatedBy: "width>200").count == 2 else { throw NSError(domain: "Quantizer guard", code: 1) }
            context.evaluateScript(js.replacingOccurrences(of: "width>200", with: "width>2048"))
            context.evaluateScript("function cameraQuantize(w,h,p,mode){return Array.from(module.exports.quantizeImage({width:w,height:h,rgba:p,mode:mode,kind:'photo'}));}")
            guard context.exception == nil else { throw NSError(domain: "Quantizer", code: 1) }
            quantizer = context
            let server = CacheHTTP(token: token, ownerToken: ownerToken)
            server.shutdown = { (UIApplication.shared.delegate as? AppDelegate)?.windowHost?.requestTermination() }
            server.route = { [weak self] method, path in self?.route(method, path) ?? (503, ["error": "Not ready"]) }
            server.homeRoute = { [weak self] method, path, reply in
                guard let self else { reply(503, ["error": "Not ready"]); return }
                self.homeControl.route(method, path, reply: reply)
            }
            try server.start(); self.server = server
            connectionStatus = "Private service: loopback 7855 · shared Natural image pipeline"
        } catch { connectionStatus = "Setup error: \(error.localizedDescription)" }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
        updateStatus()
        // Resume only after an explicit Start action in this app. Existing
        // experiment preferences and schedules are not implicitly migrated.
        if UserDefaults.standard.bool(forKey: enabledKey) { running = true; connectHome() }
        // Accessory control must not depend on scheduled camera capture being on.
        if manager == nil { connectHome() }
    }
    @objc private func copyConnectionToken() {
        guard server != nil, !token.isEmpty else { return }
        UIPasteboard.general.setItems([["public.utf8-plain-text": token]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)])
        let alert = UIAlertController(title: "Connection token copied", message: "Paste it into Pome camera setup in Organik Apps Pebble Connector. The clipboard copy expires in two minutes.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
    private func documents() throws -> URL {
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let area = view.safeAreaLayoutGuide.layoutFrame.insetBy(dx: 12, dy: 8)
        status.frame = CGRect(x: area.minX, y: area.minY, width: area.width - 140, height: 85)
        toggle.frame = CGRect(x: area.maxX - 130, y: area.minY, width: 130, height: 44)
        table.frame = CGRect(x: area.minX, y: area.minY + 92, width: area.width * 0.49, height: max(80, area.height - 92))
        let right = CGRect(x: table.frame.maxX + 16, y: table.frame.minY, width: area.width * 0.49 - 16, height: max(80, area.height - 92))
        let height = min(right.height * 0.46, right.width / sourceRatio)
        let width = height * sourceRatio
        source.frame = CGRect(x: right.midX - width / 2, y: right.minY, width: width, height: height)
        marker.frame = CGRect(x: right.minX, y: source.frame.maxY + 4, width: 16, height: 16)
        processed.frame = CGRect(x: right.minX, y: source.frame.maxY + 26, width: right.width, height: max(30, right.maxY - source.frame.maxY - 26))
    }
    @objc private func connectHome() {
        guard manager == nil else { return }
        manager = HMHomeManager(); manager?.delegate = self
        updateStatus()
    }
    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        // An authorization transition or initial empty Home response must not
        // erase saved camera choices. Stop exposing old images while unavailable.
        guard manager.authorizationStatus.contains(.authorized), !manager.homes.isEmpty else {
            cameras = []; cache.removeAll(); history.removeAll()
            table.reloadData(); updateStatus(); return
        }
        cameras = manager.homes.flatMap { $0.accessories }.filter { !($0.cameraProfiles ?? []).isEmpty }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        let valid = Set(cameras.map { $0.uniqueIdentifier.uuidString })
        cache = cache.filter { valid.contains($0.key) }
        history = history.filter { valid.contains($0.key) }
        schedules = schedules.filter { valid.contains($0.key) }
        let presetURL = try? documents().appendingPathComponent("cache-test-preset.json")
        let presetData = presetURL.flatMap { try? Data(contentsOf: $0) }
        let preset = presetData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Int] } ?? [:]
        for (index, camera) in cameras.enumerated() {
            let id = camera.uniqueIdentifier.uuidString
            if schedules[id] == nil {
                let interval = preset[camera.name] ?? 0
                schedules[id] = CameraSchedule(interval: CameraSchedule.choices.contains(interval) ? interval : 0, nextDue: Date().timeIntervalSince1970 + Double(index * 3))
            }
        }
        saveSettings(); table.reloadData(); updateStatus()
    }
    private func saveSettings() {
        if let data = try? JSONEncoder().encode(schedules) { UserDefaults.standard.set(data, forKey: prefsKey) }
    }
    @objc private func toggleCache() {
        running.toggle()
        UserDefaults.standard.set(running, forKey: enabledKey)
        if running { connectHome() }
        if !running { manual.removeAll() }
        toggle.setTitle(running ? "Pause cache" : "Start cache", for: .normal)
        updateStatus(); tick()
    }
    private func updateStatus() {
        toggle.setTitle(running ? "Pause cache" : "Start cache", for: .normal)
        let job = activeID.flatMap { id in cameras.first { $0.uniqueIdentifier.uuidString == id }?.name } ?? "Idle"
        status.text = "\(running ? "RUNNING" : "PAUSED") · \(cache.count)/\(cameras.count) cached · \(job)\n\(connectionStatus)\nBattery/solar: recommend 15 minutes or on demand. Tap a camera to change settings.\nLast capture on-screen: \(lastCaptureOnScreen.map(String.init) ?? "not tested") · nine newest images per camera, in memory"
    }
    private func tick() {
        updateStatus(); table.reloadData()
        guard running, activeID == nil, quantizer != nil else { return }
        let now = Date().timeIntervalSince1970
        manual.removeAll { schedules[$0]?.enabled != true || quarantined.contains($0) }
        let due = schedules.filter { $0.value.interval > 0 && $0.value.nextDue <= now && !quarantined.contains($0.key) }.sorted { $0.value.nextDue < $1.value.nextDue }.first?.key
        guard let id = manual.first ?? due else { return }
        manual.removeAll { $0 == id }
        begin(id)
    }
    private func begin(_ id: String) {
        guard let camera = cameras.first(where: { $0.uniqueIdentifier.uuidString == id }), let profile = camera.cameraProfiles?.first else { fail(id, "Camera unavailable"); return }
        activeID = id; jobToken = UUID(); jobStart = Date()
        let ticket = jobToken
        // A new rendering view cannot retain a previous camera's remote surface.
        source.cameraSource = nil; source.removeFromSuperview()
        source = HMCameraView(); source.backgroundColor = .black; view.addSubview(source)
        view.setNeedsLayout(); view.layoutIfNeeded()
        if manualTickets[id] != nil {
            guard let stream = profile.streamControl else { fail(id, "This camera cannot provide a live capture"); return }
            activeStream = stream; stream.delegate = self; stream.startStream()
        } else {
            guard let control = profile.snapshotControl else { fail(id, "No snapshot control"); return }
            activeControl = control; control.delegate = self
            pendingSnapshots.insert(id); control.takeSnapshot()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
            guard let self, self.activeID == id, self.jobToken == ticket else { return }
            if self.pendingSnapshots.contains(id) { self.quarantined.insert(id) }
            self.fail(id, self.activeStream != nil ? "Live camera did not respond. No cached image substituted." : "Snapshot timed out; retry blocked until late callback or restart")
        }
        updateStatus()
    }
    private func stopLiveCapture() {
        let stream = activeStream; activeStream = nil
        stream?.delegate = nil; stream?.stopStream()
    }
    func cameraStreamControlDidStartStream(_ control: HMCameraStreamControl) {
        DispatchQueue.main.async { [weak self] in
            guard let self, control === self.activeStream, let id = self.activeID,
                  let stream = control.cameraStream else { return }
            let ticket = self.jobToken
            stream.updateAudioStreamSetting(.muted) { _ in }
            self.sourceRatio = stream.aspectRatio
            self.source.cameraSource = stream
            self.view.setNeedsLayout(); self.view.layoutIfNeeded()
            self.markerWhite.toggle(); self.marker.backgroundColor = self.markerWhite ? .white : .black
            // Let decoded video arrive; snapshot callbacks alone do not establish fresh pixels.
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                guard let self, self.activeID == id, self.jobToken == ticket, self.activeStream === control else { return }
                self.capture(id: id, snapshotAt: Date(), ticket: ticket)
            }
        }
    }
    func cameraStreamControl(_ control: HMCameraStreamControl, didStopStreamWithError error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self, control === self.activeStream, let id = self.activeID else { return }
            self.fail(id, error?.localizedDescription ?? "Live camera stopped before capture")
        }
    }
    func cameraSnapshotControl(_ control: HMCameraSnapshotControl, didTake snapshot: HMCameraSnapshot?, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let camera = self.cameras.first(where: { $0.cameraProfiles?.first?.snapshotControl === control }) { self.pendingSnapshots.remove(camera.uniqueIdentifier.uuidString) }
            guard control === self.activeControl, let id = self.activeID else {
                if let camera = self.cameras.first(where: { $0.cameraProfiles?.first?.snapshotControl === control }) { self.quarantined.remove(camera.uniqueIdentifier.uuidString) }
                return
            }
            guard let snapshot, error == nil, snapshot.captureDate >= self.jobStart.addingTimeInterval(-2), snapshot.aspectRatio.isFinite, snapshot.aspectRatio > 0 else { self.fail(id, error?.localizedDescription ?? "Missing/stale snapshot"); return }
            self.sourceRatio = snapshot.aspectRatio
            self.view.setNeedsLayout(); self.view.layoutIfNeeded()
            self.source.cameraSource = snapshot
            self.markerWhite.toggle(); self.marker.backgroundColor = self.markerWhite ? .white : .black
            let ticket = self.jobToken
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                guard let self, self.activeID == id, self.jobToken == ticket else { return }
                self.capture(id: id, snapshotAt: snapshot.captureDate, ticket: ticket)
            }
        }
    }
    private func fail(_ id: String, _ message: String) {
        if let requestID = manualTickets.removeValue(forKey: id) { captureResults[id] = ["requestID": requestID, "state": "failed", "error": message] }
        manualRequestedAt[id] = nil
        errors[id] = message
        schedules[id]?.completed(now: Date().timeIntervalSince1970, success: false)
        if activeID == id { stopLiveCapture(); activeID = nil; activeControl = nil; source.cameraSource = nil; jobToken = UUID() }
        updateStatus()
    }
    private func capture(id: String, snapshotAt: Date, ticket: UUID) {
        #if targetEnvironment(macCatalyst)
        if #available(macCatalyst 18.2, *) {
            Task { @MainActor in
                do {
                    guard let uiWindow = view.window else { throw cacheError("No render window") }
                    let shareable = try await SCShareableContent.currentProcess
                    let windows = shareable.windows.filter { $0.owningApplication?.processID == ProcessInfo.processInfo.processIdentifier && $0.windowLayer == 0 && $0.title == "Pome Camera Probe" }
                    guard windows.count == 1, let window = windows.first else { throw cacheError("No unique own window") }
                    let config = SCStreamConfiguration()
                    config.width = Int(window.frame.width); config.height = Int(window.frame.height)
                    config.showsCursor = false; config.capturesAudio = false; config.ignoreShadowsSingleWindow = true
                    let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(desktopIndependentWindow: window), configuration: config)
                    guard activeID == id, jobToken == ticket else { return }
                    let scale = window.frame.width / uiWindow.bounds.width
                    let title = window.frame.height - uiWindow.bounds.height * scale
                    func pixelRect(_ rect: CGRect) -> CGRect {
                        CGRect(x: rect.minX * scale * CGFloat(image.width) / window.frame.width, y: (rect.minY * scale + title) * CGFloat(image.height) / window.frame.height, width: rect.width * scale * CGFloat(image.width) / window.frame.width, height: rect.height * scale * CGFloat(image.height) / window.frame.height).integral
                    }
                    // A stale/minimized window must not masquerade as a fresh camera
                    // capture. Check a changing marker outside the exported crop.
                    let mark = pixelRect(marker.convert(marker.bounds.insetBy(dx: 5, dy: 5), to: uiWindow))
                    guard let markerImage = image.cropping(to: mark) else { throw cacheError("Marker crop failed") }
                    let markerPixels = try rgba(markerImage, width: 1, height: 1)
                    guard markerWhite ? markerPixels[0] > 220 : markerPixels[0] < 30 else { throw cacheError("Window capture is stale; background rendering not updating") }
                    let rect = pixelRect(source.convert(source.bounds, to: uiWindow))
                    guard CGRect(x: 0, y: 0, width: image.width, height: image.height).contains(rect), let cropped = image.cropping(to: rect) else { throw cacheError("Camera crop is outside the window") }
                    if activeStream != nil {
                        let samples = try rgba(cropped, width: 32, height: 24)
                        let rgb = samples.enumerated().filter { $0.offset % 4 != 3 }.map { $0.element }
                        guard Int(rgb.max() ?? 0) - Int(rgb.min() ?? 0) > 12 else { throw cacheError("Live video pixels not ready. No cached image substituted.") }
                    }
                    let frames = try prepareFrames(cropped)
                    guard schedules[id]?.enabled == true else { stopLiveCapture(); activeID = nil; activeControl = nil; return }
                    let entry = CachedCamera(frames: frames, sourceImage: cropped, snapshotAt: snapshotAt, preparedAt: Date(), duration: Date().timeIntervalSince(jobStart))
                    cache[id] = entry
                    history[id] = Array(([entry] + (history[id] ?? [])).prefix(9))
                    if let requestedAt = manualRequestedAt[id], let requestID = manualTickets[id] {
                        if manualCaptureIsFresh(requestedAt: requestedAt, jobStartedAt: jobStart, snapshotAt: snapshotAt) {
                            manualTickets[id] = nil; manualRequestedAt[id] = nil
                            captureResults[id] = ["requestID": requestID, "state": "ready", "image": entry.id,
                                "requestedAt": requestedAt.timeIntervalSince1970, "snapshotAt": snapshotAt.timeIntervalSince1970]
                        } else if jobStart < requestedAt {
                            // Finish this older background job, then start a new HomeKit request.
                            if !manual.contains(id) { manual.insert(id, at: 0) }
                        } else {
                            manualTickets[id] = nil; manualRequestedAt[id] = nil
                            captureResults[id] = ["requestID": requestID, "state": "failed", "error": "Camera returned a snapshot from before Capture now. Try again."]
                        }
                    }
                    schedules[id]?.completed(now: Date().timeIntervalSince1970, success: true)
                    errors[id] = nil
                    processed.image = frames["emery-natural"].flatMap { preview($0) }
                    lastCaptureOnScreen = window.isOnScreen
                    stopLiveCapture(); activeID = nil; activeControl = nil; updateStatus()
                } catch { if activeID == id, jobToken == ticket { fail(id, error.localizedDescription) } }
            }
            return
        }
        #endif
        fail(id, "Needs newer Mac Catalyst")
    }
    private func cacheError(_ text: String) -> NSError { NSError(domain: "PomeCache", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
    private func rgba(_ image: CGImage, width: Int, height: Int) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let ok = bytes.withUnsafeMutableBytes { ptr -> Bool in
            guard let ctx = CGContext(data: ptr.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return false }
            ctx.interpolationQuality = .high
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height)); return true
        }
        guard ok else { throw cacheError("Pixel conversion failed") }; return bytes
    }
    private func prepareFrames(_ image: CGImage, mode: String = "natural") throws -> [String: WatchPixels] {
        var result: [String: WatchPixels] = [:]
        for (platform, height) in [("basalt", 168), ("emery", 228)] {
            guard let (w, h) = nativeCameraSize(ratio: Double(image.width) / Double(image.height), height: height) else { throw cacheError("Invalid image dimensions") }
            let bytes = try rgba(image, width: w, height: h)
            for mode in [mode] {
                quantizer?.exception = nil
                guard let array = quantizer?.objectForKeyedSubscript("cameraQuantize").call(withArguments: [w, h, bytes, mode]).toArray() as? [NSNumber], quantizer?.exception == nil, array.count == w * h else { throw cacheError("Shared image pipeline failed") }
                result["\(platform)-\(mode)"] = WatchPixels(width: w, height: h, data: Data(array.map { $0.uint8Value }))
            }
        }
        return result
    }
    private func preview(_ frame: WatchPixels) -> UIImage? {
        var data = Data(capacity: frame.width * frame.height * 4)
        for p in frame.data { data.append(contentsOf: [((p >> 4) & 3) * 85, ((p >> 2) & 3) * 85, (p & 3) * 85, 255]) }
        guard let provider = CGDataProvider(data: data as CFData), let image = CGImage(width: frame.width, height: frame.height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: frame.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else { return nil }
        return UIImage(cgImage: image)
    }
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { cameras.count }
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let camera = cameras[indexPath.row], id = camera.uniqueIdentifier.uuidString
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
        cell.textLabel?.text = camera.name
        let age = cache[id].map { entry -> String in
            let seconds = max(0, Int(Date().timeIntervalSince(entry.snapshotAt)))
            return String(format: "%02d:%02d:%02d old · %.1fs prepare", seconds / 3600, (seconds / 60) % 60, seconds % 60, entry.duration)
        } ?? "No cached image"
        cell.detailTextLabel?.text = "\(schedules[id]?.label ?? "On demand") · \(age)\n\(errors[id] ?? (activeID == id ? "Refreshing…" : ""))"
        cell.detailTextLabel?.numberOfLines = 2
        cell.accessoryType = .disclosureIndicator
        return cell
    }
    func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat { 76 }
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        let camera = cameras[indexPath.row], id = camera.uniqueIdentifier.uuidString
        let sheet = UIAlertController(title: camera.name, message: "Battery/solar cameras: use 15 minutes or on demand. The nine newest successful snapshots are kept in memory. Hiding clears this camera's history.", preferredStyle: .alert)
        sheet.addAction(UIAlertAction(title: "Refresh now", style: .default) { [weak self] _ in _ = self?.request(id) })
        for interval in CameraSchedule.choices {
            sheet.addAction(UIAlertAction(title: CameraSchedule(interval: interval).label, style: .default) { [weak self] _ in
                guard let self else { return }
                self.schedules[id] = CameraSchedule(interval: interval, nextDue: Date().timeIntervalSince1970)
                if interval < 0 { self.cache[id] = nil; self.history[id] = nil; self.manual.removeAll { $0 == id } }
                self.saveSettings(); self.table.reloadData()
            })
        }
        sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        present(sheet, animated: true)
    }
    private func request(_ id: String) -> Bool {
        guard running, schedules[id]?.enabled == true, !quarantined.contains(id) else { return false }
        manualTickets[id] = UUID().uuidString
        manualRequestedAt[id] = Date()
        captureResults[id] = ["requestID": manualTickets[id]!, "state": "queued"]
        // Manual work takes precedence over an unrelated background snapshot.
        // HomeKit cannot cancel its request, so ignore its late callback and do
        // not re-request that control until that callback arrives.
        if let other = activeID, other != id, manualTickets[other] == nil {
            if pendingSnapshots.contains(other) { quarantined.insert(other) }
            let retryInterval = max(30, schedules[other]?.interval ?? 30)
            schedules[other]?.nextDue = Date().timeIntervalSince1970 + Double(retryInterval)
            activeID = nil; activeControl = nil; jobToken = UUID(); source.cameraSource = nil
        }
        if activeID != id, !manual.contains(id), manual.count < 64 { manual.insert(id, at: 0) }
        tick()
        return true
    }
    private func route(_ method: String, _ rawPath: String) -> (Int, [String: Any]) {
        guard let url = URLComponents(string: rawPath) else { return (400, ["error": "Invalid URL"]) }
        if method == "GET", url.path == "/health" {
            let authorized = manager?.authorizationStatus.contains(.authorized) == true
            var captureSupported = false
            if #available(macCatalyst 18.2, *) { captureSupported = true }
            return (200, ["service": "org.organikapps.pome.cameras", "protocol": 1,
                          "homeAuthorized": authorized, "running": running,
                          "captureSupported": captureSupported,
                          "enabledCameras": cameras.filter { schedules[$0.uniqueIdentifier.uuidString]?.enabled == true }.count,
                          "renderSurface": (UIApplication.shared.delegate as? AppDelegate)?.windowHost?.state() ?? [:]])
        }
        if method == "POST", url.path == "/service/start" {
            if !running { toggleCache() }; connectHome()
            return (200, ["running": running])
        }
        if method == "POST", url.path == "/service/pause" {
            if running { toggleCache() }
            for id in Array(manualTickets.keys) { fail(id, "Camera capture paused") }
            if let id = activeID { fail(id, "Camera capture paused") }
            return (200, ["running": false])
        }
        if method == "POST", url.path == "/service/home" {
            connectHome(); return (200, ["requested": true])
        }
        if method == "GET", url.path == "/camera-settings" {
            return (200, ["cameras": cameras.map { camera -> [String: Any] in
                let id = camera.uniqueIdentifier.uuidString
                return ["id": id, "name": camera.name, "interval": schedules[id]?.interval ?? 0]
            }])
        }
        if method == "GET", url.path == "/cameras" {
            let items: [[String: Any]] = cameras.filter { schedules[$0.uniqueIdentifier.uuidString]?.enabled == true }.map {
                let id = $0.uniqueIdentifier.uuidString
                return ["id": id, "name": $0.name, "interval": schedules[id]?.interval ?? 0, "ready": cache[id] != nil, "age": cache[id].map { Int(Date().timeIntervalSince($0.snapshotAt)) } ?? -1, "error": errors[id] ?? ""]
            }
            return (200, ["running": running, "liveCaptureActive": activeStream != nil, "cameras": items])
        }
        let parts = url.path.split(separator: "/")
        guard parts.count == 2 else { return (404, ["error": "Not found"]) }
        let id = String(parts[1])
        if method == "POST", parts[0] == "schedule" {
            guard schedules[id] != nil else { return (404, ["error": "Unknown camera"]) }
            guard let raw = url.queryItems?.first(where: { $0.name == "interval" })?.value,
                  let interval = Int(raw), CameraSchedule.choices.contains(interval) else { return (400, ["error": "Invalid interval"]) }
            if schedules[id]?.interval != interval {
                schedules[id] = CameraSchedule(interval: interval, nextDue: Date().timeIntervalSince1970)
                if interval < 0 { cache[id] = nil; history[id] = nil; manual.removeAll { $0 == id } }
                saveSettings(); table.reloadData()
            }
            return (200, ["saved": true, "interval": interval])
        }
        guard schedules[id]?.enabled == true else { return (404, ["error": "Camera not enabled"]) }
        if method == "GET", parts[0] == "capture" {
            guard var result = captureResults[id], result["requestID"] as? String == url.queryItems?.first(where: { $0.name == "request" })?.value else { return (404, ["error": "Capture request expired"]) }
            if manualTickets[id] != nil { result["state"] = activeID == id && jobStart >= (manualRequestedAt[id] ?? .distantFuture) ? "capturing" : "queued" }
            return (200, result)
        }
        if method == "GET", parts[0] == "history" {
            return (200, ["images": (history[id] ?? []).map { entry -> [String: Any] in
                ["id": entry.id, "snapshotAt": entry.snapshotAt.timeIntervalSince1970,
                 "age": max(0, Int(Date().timeIntervalSince(entry.snapshotAt)))]
            }])
        }
        if method == "POST", parts[0] == "refresh" {
            return request(id) ? (202, ["queued": true, "requestID": manualTickets[id] ?? captureResults[id]?["requestID"] ?? ""]) : (409, ["error": "Cache paused or camera busy/unavailable"])
        }
        if method == "GET", parts[0] == "frame" {
            let platform = url.queryItems?.first { $0.name == "platform" }?.value ?? "emery"
            let imageID = url.queryItems?.first { $0.name == "image" }?.value
            let mode = url.queryItems?.first { $0.name == "mode" }?.value ?? "natural"
            guard ["natural", "high-contrast", "original"].contains(mode) else { return (400, ["error": "Invalid image mode"]) }
            let selected = imageID.flatMap { wanted in history[id]?.first { $0.id == wanted } } ?? (imageID == nil ? cache[id] : nil)
            guard let entry = selected else { return (404, ["error": imageID == nil ? "No prepared image yet" : "Saved image expired; reopen camera history"]) }
            if entry.frames["\(platform)-\(mode)"] == nil {
                do { entry.frames.merge(try prepareFrames(entry.sourceImage, mode: mode)) { _, new in new } }
                catch { return (500, ["error": "Image processing failed"]) }
            }
            guard let frame = entry.frames["\(platform)-\(mode)"] else { return (400, ["error": "Unsupported watch platform"]) }
            let byteLimit = platform == "basalt" ? 48000 : 110000
            guard (frame.width * frame.height * 6 + 7) / 8 <= byteLimit else { return (422, ["error": "Camera aspect ratio exceeds this watch's panorama memory limit"]) }
            var result = frame.json
            result["image"] = entry.id
            result["age"] = Int(Date().timeIntervalSince(entry.snapshotAt))
            result["preparedAt"] = entry.preparedAt.timeIntervalSince1970
            result["snapshotAt"] = entry.snapshotAt.timeIntervalSince1970
            result["prepareSeconds"] = entry.duration
            result["refreshError"] = errors[id] ?? ""
            return (200, result)
        }
        return (404, ["error": "Not found"])
    }
}
