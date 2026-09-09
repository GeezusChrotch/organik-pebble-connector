import AppKit

@objc(PomeCameraWindowHosting) protocol PomeCameraWindowHosting: NSObjectProtocol {
    init()
    func start()
    func requestTermination()
    func state() -> NSDictionary
}

// Loaded only inside the Catalyst helper. No other application's windows are
// enumerated, moved, or captured. An ordered-out own render surface continues
// receiving HomeKit video while the Connector owns all user-facing controls.
@objc(PomeCameraWindowHost) final class PomeCameraWindowHost: NSObject, PomeCameraWindowHosting {
    private var timer: Timer?
    required override init() { super.init() }
    func start() {
        NSApp.setActivationPolicy(.accessory)
        positionSurface()
        timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in self?.positionSurface() }
    }
    func requestTermination() { NSApp.terminate(nil) }
    private func positionSurface() {
        for window in NSApp.windows where window.title == "Pome Camera Probe" {
            window.isExcludedFromWindowsMenu = true
            window.collectionBehavior = [.transient, .ignoresCycle, .fullScreenAuxiliary]
            if window.isMiniaturized { window.deminiaturize(nil) }
            window.styleMask = [.titled, .closable, .resizable, .miniaturizable]
            window.orderOut(nil)
        }
    }
    func state() -> NSDictionary {
        let windows = NSApp.windows.filter { $0.title == "Pome Camera Probe" }
        let offscreen = windows.count == 1 && (!windows[0].isVisible || !NSScreen.screens.contains { $0.frame.intersects(windows[0].frame) })
        return ["surfaceCount": windows.count, "offscreen": offscreen, "dockHidden": NSApp.activationPolicy() != .regular,
                "miniaturized": windows.first?.isMiniaturized ?? false]
    }
}
