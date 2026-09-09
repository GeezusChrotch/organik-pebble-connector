import Foundation
// A manual request cannot be fulfilled by a job/snapshot predating that request.
func manualCaptureIsFresh(requestedAt: Date, jobStartedAt: Date, snapshotAt: Date) -> Bool {
    jobStartedAt >= requestedAt && snapshotAt >= requestedAt
}
func nativeCameraSize(ratio: Double, height: Int) -> (Int, Int)? {
    guard ratio.isFinite, ratio > 0, height > 0, ratio * Double(height) <= 2048 else { return nil }
    return (max(1, Int((ratio * Double(height)).rounded())), height)
}
func packCameraPixels(_ pixels: Data) -> Data {
    var result = Data(); var accumulator: UInt32 = 0; var bits = 0
    for pixel in pixels {
        accumulator = (accumulator << 6) | UInt32(pixel & 63); bits += 6
        if bits >= 8 { bits -= 8; result.append(UInt8((accumulator >> bits) & 255)) }
    }
    if bits > 0 { result.append(UInt8((accumulator << (8 - bits)) & 255)) }
    return result
}

// Pure scheduling model; images and HomeKit objects belong to the controller.
struct CameraSchedule: Codable {
    var interval: Int = 0 // -1 hidden; 0 on demand; positive seconds
    var nextDue: Double = 0
    var failures: Int = 0
    static let choices = [-1, 0, 15, 30, 60, 300, 900, 3600]
    var enabled: Bool { interval >= 0 }
    var label: String {
        switch interval {
        case -1: return "Hidden"
        case 0: return "On demand"
        case 15: return "Every 15 seconds"
        case 30: return "Every 30 seconds"
        case 60: return "Every minute"
        case 300: return "Every 5 minutes"
        case 900: return "Every 15 minutes"
        default: return "Every hour"
        }
    }
    mutating func completed(now: Double, success: Bool) {
        failures = success ? 0 : min(6, failures + 1)
        let backoff = success ? 0 : min(900, 30 * (1 << failures))
        nextDue = now + Double(max(interval, backoff))
    }
}

func fittedSize(ratio: Double, width: Int, height: Int) -> (Int, Int)? {
    guard ratio.isFinite, ratio > 0, width > 0, height > 0 else { return nil }
    let w = max(1, min(width, Int(floor(Double(height) * ratio))))
    let h = max(1, min(height, Int(floor(Double(w) / ratio))))
    return (w, h)
}
