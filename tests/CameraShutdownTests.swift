import Foundation
@main struct CameraShutdownTests {
    static func main() async throws {
        let server = CacheHTTP(token: "camera-test", port: 0, ownerToken: "owner-test")
        var stopped = false
        server.shutdown = { stopped = true }
        try server.start()
        defer { server.stop() }
        for _ in 0..<100 { if let port = server.boundPort, port != 0 { break }; try await Task.sleep(nanoseconds: 20_000_000) }
        guard let port = server.boundPort, port != 0, port != 7855 else { fatalError("No isolated test listener") }
        func request(_ camera: String?, _ owner: String?) async throws -> Int {
            var r = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/service/quit")!)
            r.httpMethod = "POST"; r.timeoutInterval = 2
            if let camera { r.setValue("Bearer " + camera, forHTTPHeaderField: "Authorization") }
            if let owner { r.setValue(owner, forHTTPHeaderField: "X-Organik-Camera-Owner") }
            let (_, response) = try await URLSession.shared.data(for: r)
            return (response as! HTTPURLResponse).statusCode
        }
        let unauthorized = try await request(nil, "owner-test")
        let phoneOnly = try await request("camera-test", nil)
        let wrongOwner = try await request("camera-test", "wrong")
        assert(unauthorized == 401 && phoneOnly == 403 && wrongOwner == 403 && !stopped)
        let owned = try await request("camera-test", "owner-test")
        assert(owned == 200)
        try await Task.sleep(nanoseconds: 200_000_000)
        assert(stopped)
        print("PASS: camera shutdown requires both service credential and owner nonce; isolated listener only")
    }
}
