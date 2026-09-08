import Foundation
@main struct CameraGroupProbe {
    static func main() throws {
        guard let shared = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.org.organikapps.pebbleconnector") else {
            throw CocoaError(.fileWriteNoPermission)
        }
        // Synthetic protocol fixture only; no actual camera token, HomeKit
        // permission request, server listener, preferences or image capture.
        let data = try JSONSerialization.data(withJSONObject: ["producer": Bundle.main.bundleIdentifier ?? "", "probe": "camera-group-handoff"])
        try data.write(to: shared.appendingPathComponent("SandboxProbe-camera.json"), options: .atomic)
        print("Camera group fixture published")
    }
}
