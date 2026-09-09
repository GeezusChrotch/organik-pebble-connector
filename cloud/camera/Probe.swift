import UIKit
import HomeKit
#if targetEnvironment(macCatalyst)
import ScreenCaptureKit
#endif

@objc(PomeCameraWindowHosting) protocol PomeCameraWindowHosting: NSObjectProtocol {
    init()
    func start()
    func requestTermination()
    func state() -> NSDictionary
}

// Isolated feasibility test: no server, camera streams, desktop capture, or disk images.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var windowHost: PomeCameraWindowHosting?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let url = Bundle.main.builtInPlugInsURL?.appendingPathComponent("CameraWindowHost.bundle"),
           let bundle = Bundle(url: url), let type = bundle.principalClass as? PomeCameraWindowHosting.Type {
            windowHost = type.init(); windowHost?.start()
        }
        return true
    }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Camera Probe", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = ProbeSceneDelegate.self
        return configuration
    }
}

final class ProbeSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        scene.title = "Pome Camera Probe"
        let window = UIWindow(windowScene: scene)
        window.rootViewController = UINavigationController(rootViewController: CameraCacheController())
        window.isHidden = false
        self.window = window
    }
}

final class CameraList: UITableViewController, HMHomeManagerDelegate {
    private var manager: HMHomeManager?
    private var cameras: [HMAccessory] = []
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Pome Camera Probe"
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Allow Home", style: .plain, target: self, action: #selector(connect))
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "camera")
    }
    @objc private func connect() {
        guard manager == nil else { return }
        manager = HMHomeManager()
        manager?.delegate = self
        title = "Waiting for Home access…"
    }
    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        cameras = manager.homes.flatMap { $0.accessories }.filter { !($0.cameraProfiles ?? []).isEmpty }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        title = "Cameras (\(cameras.count))"
        tableView.reloadData()
    }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { cameras.count }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "camera", for: indexPath)
        cell.textLabel?.text = cameras[indexPath.row].name
        cell.accessoryType = .disclosureIndicator
        return cell
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        navigationController?.pushViewController(SnapshotProbe(camera: cameras[indexPath.row]), animated: true)
    }
}

final class SnapshotProbe: UIViewController, HMCameraSnapshotControlDelegate {
    private let camera: HMAccessory
    private let cameraView = HMCameraView()
    private let exportedView = UIImageView()
    private let layerExportedView = UIImageView()
    private let status = UILabel()
    private var control: HMCameraSnapshotControl?
    private var timeout: Timer?
    private var active = true
    private var pending = false
    private var imageAspectConstraints: [NSLayoutConstraint] = []
    private var snapshotAspectRatio: Double?
    private var detachedTest = false
    private var detachedCameraView: HMCameraView?
    private var invisibleHostTest = false
    private var renderWindow: UIWindow?
    private var coveredHostTest = false
    private var windowCapturePending = false
    init(camera: HMAccessory) { self.camera = camera; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Not implemented") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = camera.name
        view.backgroundColor = .systemBackground
        status.numberOfLines = 0
        status.text = "Take one still, then test whether this app's own camera view renders into an image. No desktop capture."
        exportedView.contentMode = .scaleAspectFit
        exportedView.backgroundColor = .secondarySystemBackground
        layerExportedView.contentMode = .scaleAspectFit
        layerExportedView.backgroundColor = .secondarySystemBackground
        cameraView.contentMode = .scaleAspectFit
        cameraView.clipsToBounds = true
        exportedView.clipsToBounds = true
        let take = UIButton(type: .system)
        take.setTitle("Request one snapshot", for: .normal)
        take.addTarget(self, action: #selector(takeSnapshot), for: .touchUpInside)
        let export = UIButton(type: .system)
        export.setTitle("Test image export", for: .normal)
        export.addTarget(self, action: #selector(testExport), for: .touchUpInside)
        let detached = UIButton(type: .system)
        detached.setTitle("Test fresh snapshot without preview", for: .normal)
        detached.addTarget(self, action: #selector(testDetachedSnapshot), for: .touchUpInside)
        let hosted = UIButton(type: .system)
        hosted.setTitle("Test invisible hosted snapshot", for: .normal)
        hosted.addTarget(self, action: #selector(testInvisibleSnapshot), for: .touchUpInside)
        let covered = UIButton(type: .system)
        covered.setTitle("Test snapshot behind opaque app content", for: .normal)
        covered.addTarget(self, action: #selector(testCoveredSnapshot), for: .touchUpInside)
        let ownWindow = UIButton(type: .system)
        ownWindow.setTitle("Capture only this app's window", for: .normal)
        ownWindow.addTarget(self, action: #selector(testOwnWindow), for: .touchUpInside)
        let watchStill = UIButton(type: .system)
        watchStill.setTitle("Prepare private watch still", for: .normal)
        watchStill.addTarget(self, action: #selector(prepareWatchStill), for: .touchUpInside)
        let delayedWindow = UIButton(type: .system)
        delayedWindow.setTitle("Capture own window in 15 seconds (minimize test)", for: .normal)
        delayedWindow.addTarget(self, action: #selector(testDelayedOwnWindow), for: .touchUpInside)
        let viewLabel = UILabel()
        viewLabel.text = "EXPORTED IMAGE — must contain the same scene, not a blank box"
        let layerLabel = UILabel()
        layerLabel.text = "Offscreen alternative: layer rendering"
        let stack = UIStackView(arrangedSubviews: [status, take, watchStill, ownWindow, delayedWindow, detached, hosted, covered, cameraView, export, viewLabel, exportedView, layerLabel, layerExportedView])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -12),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -16),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -32)
        ])
        setImageAspectRatio(16.0 / 9.0) // Placeholder only, before a snapshot arrives.
        control = camera.cameraProfiles?.first?.snapshotControl
        control?.delegate = self
    }
    @objc private func prepareWatchStill() {
        guard let snapshot = cameraView.cameraSource as? HMCameraSnapshot, !pending else {
            status.text = "Request a visible snapshot first."
            return
        }
        navigationController?.pushViewController(WatchStillController(snapshot: snapshot), animated: true)
    }
    @objc private func testOwnWindow() { scheduleOwnWindowCapture(delay: 0.3) }
    @objc private func testDelayedOwnWindow() { scheduleOwnWindowCapture(delay: 15) }
    private func scheduleOwnWindowCapture(delay: Double) {
        guard active, !pending, !windowCapturePending, cameraView.cameraSource != nil else {
            status.text = "Request a visible snapshot first and wait for it to finish."
            return
        }
        windowCapturePending = true
        exportedView.image = nil
        status.text = delay > 1 ? "Capture scheduled in 15 seconds. Minimize this app now. No desktop or other app can be selected." : "Capturing only this app's window. No desktop or Home-app fallback."
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.active else { return }
            #if targetEnvironment(macCatalyst)
            if #available(macCatalyst 18.2, *) {
                Task { @MainActor in
                    defer { self.windowCapturePending = false }
                    do {
                        // Do not replace with a system-wide enumeration or picker.
                        let content = try await SCShareableContent.currentProcess
                        let windows = content.windows.filter {
                            $0.owningApplication?.processID == ProcessInfo.processInfo.processIdentifier && $0.windowLayer == 0 && $0.title == "Pome Camera Probe"
                        }
                        guard windows.count == 1, let own = windows.first else {
                            self.status.text = "Stopped: expected one own-process window; found \(windows.count). No broader capture attempted."
                            return
                        }
                        let filter = SCContentFilter(desktopIndependentWindow: own)
                        let config = SCStreamConfiguration()
                        config.width = 640
                        config.height = max(1, Int(640 * own.frame.height / max(1, own.frame.width)))
                        config.showsCursor = false
                        config.capturesAudio = false
                        config.ignoreShadowsSingleWindow = true
                        let captured = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
                        guard self.active else { return }
                        let result = UIImage(cgImage: captured)
                        self.exportedView.image = result
                        self.status.text = "Own-window capture (window on-screen at capture: \(own.isOnScreen)): \(self.pixelDiagnostic(result)). Verify the camera picture appears INSIDE the lower exported screenshot, not only in the HomeKit preview. Nothing saved or transmitted."
                    } catch {
                        self.status.text = "Own-window capture failed: \(error.localizedDescription). No permission request or broader capture fallback was attempted."
                    }
                }
                return
            }
            #endif
            self.windowCapturePending = false
            self.status.text = "Own-window test needs Mac Catalyst 18.2 or newer."
        }
    }
    private func setImageAspectRatio(_ ratio: Double) {
        NSLayoutConstraint.deactivate(imageAspectConstraints)
        imageAspectConstraints = [cameraView, exportedView, layerExportedView].map {
            $0.heightAnchor.constraint(equalTo: $0.widthAnchor, multiplier: CGFloat(1.0 / ratio))
        }
        NSLayoutConstraint.activate(imageAspectConstraints)
        view.layoutIfNeeded()
    }
    @objc private func takeSnapshot() {
        requestSnapshot(detached: false)
    }
    @objc private func testDetachedSnapshot() {
        requestSnapshot(detached: true)
    }
    @objc private func testInvisibleSnapshot() {
        requestSnapshot(detached: true, invisibleHost: true)
    }
    @objc private func testCoveredSnapshot() {
        requestSnapshot(detached: true, coveredHost: true)
    }
    private func requestSnapshot(detached: Bool, invisibleHost: Bool = false, coveredHost: Bool = false) {
        guard active, !pending, let control else { return }
        detachedTest = detached
        invisibleHostTest = invisibleHost
        coveredHostTest = coveredHost
        releaseRenderWindow()
        detachedCameraView = nil
        pending = true
        exportedView.image = nil
        layerExportedView.image = nil
        cameraView.cameraSource = nil
        snapshotAspectRatio = nil
        status.text = detached ? "Requesting one fresh still for an offscreen-only view…" : "Requesting one still…"
        timeout = Timer.scheduledTimer(withTimeInterval: 20, repeats: false) { [weak self] _ in
            self?.status.text = "Snapshot timed out. Return to the list to retry."
            // Do not overlap an outstanding HomeKit request with another request.
        }
        control.takeSnapshot()
    }
    func cameraSnapshotControl(_ cameraSnapshotControl: HMCameraSnapshotControl, didTake snapshot: HMCameraSnapshot?, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.active else { return }
            self.timeout?.invalidate()
            guard let snapshot, error == nil else {
                self.pending = false
                self.status.text = "Snapshot unavailable: \(error?.localizedDescription ?? "No image returned")"
                return
            }
            let ratio = snapshot.aspectRatio
            guard ratio.isFinite, ratio > 0 else {
                self.pending = false
                self.status.text = "HomeKit returned no valid aspect ratio. Export disabled to avoid a distorted image."
                return
            }
            self.snapshotAspectRatio = ratio
            self.setImageAspectRatio(ratio)
            if self.detachedTest {
                // Detached mode never attaches this view. Hosted mode adds it to
                // a transparent, non-key window, never a visible camera preview.
                let detached = HMCameraView(frame: CGRect(x: 0, y: 0, width: 320, height: 320 / ratio))
                if self.coveredHostTest, let window = self.view.window {
                    // The root UI stays opaque and covers this non-interactive
                    // camera surface. No screenshot or composited window export.
                    detached.isUserInteractionEnabled = false
                    window.insertSubview(detached, at: 0)
                }
                if self.invisibleHostTest, let scene = self.view.window?.windowScene {
                    let host = UIWindow(windowScene: scene)
                    host.alpha = 0
                    host.frame = CGRect(x: 0, y: 0, width: 320, height: 320 / ratio)
                    let controller = UIViewController()
                    host.rootViewController = controller
                    controller.view.addSubview(detached)
                    host.isHidden = false
                    self.renderWindow = host
                }
                detached.cameraSource = snapshot
                detached.layoutIfNeeded()
                self.detachedCameraView = detached
                self.status.text = self.invisibleHostTest ? "Still received. Testing a transparent non-key render window…" : "Still received. Rendering an unattached camera view; no camera preview is shown."
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                    guard let self, self.active, let detached = self.detachedCameraView else { return }
                    self.exportDetachedView(detached)
                    detached.removeFromSuperview()
                    self.pending = false
                    self.detachedCameraView = nil
                    self.releaseRenderWindow()
                }
                return
            }
            self.pending = false
            self.cameraView.cameraSource = snapshot
            self.status.text = String(format: "HomeKit still received (aspect %.3f:1). Once visible above, test image export. Scroll down to compare the exported image.", ratio)
        }
    }
    private func exportDetachedView(_ source: HMCameraView) {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: source.bounds.size, format: format)
        var complete = false
        let viewImage = renderer.image { _ in
            complete = source.drawHierarchy(in: source.bounds, afterScreenUpdates: true)
        }
        let layerImage = renderer.image { context in source.layer.render(in: context.cgContext) }
        exportedView.image = viewImage
        layerExportedView.image = layerImage
        status.text = "\(coveredHostTest ? "Covered" : invisibleHostTest ? "Invisible hosted" : "Detached") test finished. View: \(pixelDiagnostic(viewImage)). Layer: \(pixelDiagnostic(layerImage)). UIKit reported complete: \(complete). Scroll down to verify the actual scene. Nothing saved or sent."
        source.cameraSource = nil
    }
    private func releaseRenderWindow() {
        renderWindow?.isHidden = true
        renderWindow?.rootViewController = nil
        renderWindow = nil
    }
    private func pixelDiagnostic(_ image: UIImage) -> String {
        guard let cg = image.cgImage else { return "FAIL: no image" }
        let width = cg.width, height = cg.height
        guard width > 0, height > 0, width <= 4_000_000 / height else { return "FAIL: invalid size" }
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let success = pixels.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard success else { return "FAIL: pixel read failed" }
        var visible = 0
        var colors = Set<UInt32>()
        for index in stride(from: 0, to: pixels.count, by: 4) where pixels[index + 3] != 0 {
            visible += 1
            if colors.count < 256 {
                colors.insert(UInt32(pixels[index]) << 16 | UInt32(pixels[index + 1]) << 8 | UInt32(pixels[index + 2]))
            }
        }
        if visible == 0 { return "FAIL: fully transparent export" }
        if colors.count == 1 { return "FAIL: solid-color export (verify camera is not genuinely uniform)" }
        return "\(visible) nontransparent pixels, \(colors.count == 256 ? "256+" : String(colors.count)) colors — visual verification still required"
    }
    @objc private func testExport() {
        guard cameraView.cameraSource != nil, snapshotAspectRatio != nil else { status.text = "Request a snapshot first."; return }
        view.layoutIfNeeded()
        guard cameraView.bounds.width > 0, cameraView.bounds.height > 0 else { return }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        var complete = false
        let image = UIGraphicsImageRenderer(size: cameraView.bounds.size, format: format).image { _ in
            complete = cameraView.drawHierarchy(in: cameraView.bounds, afterScreenUpdates: true)
        }
        exportedView.image = image
        status.text = "\(pixelDiagnostic(image)). UIKit reported complete: \(complete). The lower EXPORTED IMAGE panel must show the scene. The HomeKit preview alone does NOT prove export works. Nothing saved or sent."
    }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        active = false
        timeout?.invalidate()
        control?.delegate = nil
        cameraView.cameraSource = nil
        exportedView.image = nil
        layerExportedView.image = nil
        detachedCameraView?.cameraSource = nil
        detachedCameraView?.removeFromSuperview()
        detachedCameraView = nil
        releaseRenderWindow()
    }
}

// A camera-only capture surface. The saved still remains in this app's private
// Documents directory and is never uploaded by this helper.
final class WatchStillController: UIViewController {
    private let snapshot: HMCameraSnapshot
    private let cameraView = HMCameraView()
    private var saving = false
    init(snapshot: HMCameraSnapshot) { self.snapshot = snapshot; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Not implemented") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Private watch still"
        view.backgroundColor = .black
        view.addSubview(cameraView)
        cameraView.cameraSource = snapshot
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Save watch still", style: .plain, target: self, action: #selector(saveStill))
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let available = view.safeAreaLayoutGuide.layoutFrame.insetBy(dx: 8, dy: 8)
        let ratio = snapshot.aspectRatio
        guard ratio.isFinite, ratio > 0 else { return }
        let width = min(available.width, available.height * ratio)
        let height = width / ratio
        cameraView.frame = CGRect(x: available.midX - width / 2, y: available.midY - height / 2, width: width, height: height)
    }
    @objc private func saveStill() {
        guard !saving, let uiWindow = view.window else { return }
        #if targetEnvironment(macCatalyst)
        if #available(macCatalyst 18.2, *) {
            saving = true
            Task { @MainActor in
                defer { saving = false }
                do {
                    view.layoutIfNeeded()
                    let content = try await SCShareableContent.currentProcess
                    let windows = content.windows.filter { $0.owningApplication?.processID == ProcessInfo.processInfo.processIdentifier && $0.windowLayer == 0 && $0.title == "Pome Camera Probe" }
                    guard windows.count == 1, let window = windows.first else { title = "No unique own window"; return }
                    let config = SCStreamConfiguration()
                    config.width = Int(window.frame.width)
                    config.height = Int(window.frame.height)
                    config.showsCursor = false
                    config.capturesAudio = false
                    config.ignoreShadowsSingleWindow = true
                    let filter = SCContentFilter(desktopIndependentWindow: window)
                    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
                    let rect = cameraView.convert(cameraView.bounds, to: uiWindow)
                    // UIKit excludes the native title bar; the captured NSWindow
                    // includes it. Both are measured here rather than hardcoded.
                    let catalystScale = window.frame.width / uiWindow.bounds.width
                    let titleHeight = window.frame.height - uiWindow.bounds.height * catalystScale
                    let sx = CGFloat(image.width) / window.frame.width
                    let sy = CGFloat(image.height) / window.frame.height
                    let crop = CGRect(x: rect.minX * catalystScale * sx, y: (rect.minY * catalystScale + titleHeight) * sy, width: rect.width * catalystScale * sx, height: rect.height * catalystScale * sy).integral
                    guard CGRect(x: 0, y: 0, width: image.width, height: image.height).contains(crop), let cropped = image.cropping(to: crop), let png = UIImage(cgImage: cropped).pngData() else { title = "Crop failed; nothing saved"; return }
                    let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let output = folder.appendingPathComponent("watch-still.png")
                    try png.write(to: output, options: .atomic)
                    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: output.path)
                    title = "Saved private still (\(cropped.width)×\(cropped.height))"
                } catch { title = "Save failed: \(error.localizedDescription)" }
            }
        }
        #endif
    }
}
