import Foundation
@main struct Reader {
    static func main() throws {
        guard let folder = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.org.organikapps.pebbleconnector") else { throw CocoaError(.fileReadNoPermission) }
        let file = folder.appendingPathComponent("SandboxProbe-camera.json")
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: String]
        let valid = value?["producer"] == "com.organikapps.pome.camera-probe" && value?["probe"] == "camera-group-handoff"
        guard valid else { throw CocoaError(.fileReadCorruptFile) }
        try FileManager.default.removeItem(at: file)
        print("{\"cameraToConnectorAppGroup\":true,\"syntheticFixtureRemoved\":true}")
    }
}
