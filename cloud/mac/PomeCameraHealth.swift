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


struct PomeHomeHealth {
    let ready: Bool
    let detail: String
    init(_ value: [String: Any], status: Int) {
        ready = status == 200 && value["backend"] as? String == "homekit" && value["protocol"] as? Int == 1 && (value["homes"] as? Int ?? 0) > 0
        if ready { detail = "Apple Home is ready." }
        else if status == 403 { detail = "Allow Home access, then check again." }
        else if status == 503 { detail = "Apple Home is loading or no homes are available. Check your homes in Apple Home, then retry." }
        else if status == 404 || status == 200 { detail = "This service does not support direct HomeKit. Start the updated Connector helper." }
        else if status == 401 { detail = "Reconnect to the local Pome service to reload its saved credential." }
        else { detail = "The HomeKit service could not be reached. Start the Pome connection and check again." }
    }
}
