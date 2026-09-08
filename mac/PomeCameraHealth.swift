import Foundation

struct PomeCameraHealth {
    let valid: Bool, home: Bool, running: Bool, capture: Bool, cameras: Bool
    init(_ value: [String: Any]) {
        valid = value["service"] as? String == "org.organikapps.pome.cameras" && value["protocol"] as? Int == 1
        home = valid && value["homeAuthorized"] as? Bool == true
        running = valid && value["running"] as? Bool == true
        capture = valid && value["captureSupported"] as? Bool == true
        cameras = valid && (value["enabledCameras"] as? Int ?? 0) > 0
    }
}
