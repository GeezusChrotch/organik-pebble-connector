import AppKit

@objc(PomeCameraWindowHosting) protocol PomeCameraWindowHosting: NSObjectProtocol {
    init()
    func start()
    func requestTermination()
    func state() -> NSDictionary
}

// Loaded only inside the Catalyst helper. No other application's windows are
// enumerated, moved, or captured. Keep the surface in the display's geometry,
// but below the desktop background: ordered-out or fully off-display surfaces
// can stop rendering or be rejected by ScreenCaptureKit.
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
            window.collectionBehavior = [.transient, .ignoresCycle, .fullScreenAuxiliary, .canJoinAllSpaces]
            if window.isMiniaturized { window.deminiaturize(nil) }
            if window.styleMask != [.borderless] { window.styleMask = [.borderless] }
            window.ignoresMouseEvents = true
            // macOS 27 WindowManager wallpaper surfaces are at desktopWindow-1.
            // Sharing that level can put this window ABOVE the wallpaper even
            // though it reports "belowDesktop". Keep a strictly lower level.
            window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)) - 2)
            if let screen = NSScreen.screens.first {
                let area = screen.frame.insetBy(dx: 16, dy: 16)
                let frame = CGRect(x: area.minX, y: area.minY,
                                   width: min(1000, area.width), height: min(720, area.height))
                if window.frame != frame { window.setFrame(frame, display: true) }
            }
            if !window.isVisible { window.orderBack(nil) }
        }
    }
    func state() -> NSDictionary {
        let windows = NSApp.windows.filter { $0.title == "Pome Camera Probe" }
        let offscreen = windows.count == 1 && (!windows[0].isVisible || !NSScreen.screens.contains { $0.frame.intersects(windows[0].frame) })
        return ["surfaceCount": windows.count, "offscreen": offscreen, "dockHidden": NSApp.activationPolicy() != .regular,
                "miniaturized": windows.first?.isMiniaturized ?? false,
                "ordered": windows.first?.isVisible ?? false,
                "belowDesktop": windows.first.map { $0.level.rawValue < Int(CGWindowLevelForKey(.desktopWindow)) } ?? false,
                "windowLevel": windows.first?.level.rawValue ?? 0,
                "desktopLevel": Int(CGWindowLevelForKey(.desktopWindow))]
    }
}
