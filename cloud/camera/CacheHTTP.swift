import Foundation
import Network

// Loopback only. External access must use a private TLS proxy, never Funnel.
// No image files, request logging, CORS wildcard, or unauthenticated inventory.
final class CacheHTTP {
    private var listener: NWListener?
    private var clients = 0
    let token: String
    private let requestedPort: UInt16
    private let ownerToken: String
    var boundPort: UInt16? { listener?.port?.rawValue }
    var shutdown: (() -> Void)?
    var route: ((String, String) -> (Int, [String: Any]))?
    init(token: String, port: UInt16 = 7855, ownerToken: String = ProcessInfo.processInfo.environment["ORGANIK_CAMERA_OWNER_TOKEN"] ?? "") {
        self.token = token; self.requestedPort = port; self.ownerToken = ownerToken
    }
    func stop() { listener?.cancel(); listener = nil }
    func start() throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: requestedPort)!)
        let listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in
            guard let self, self.clients < 8 else { connection.cancel(); return }
            self.clients += 1
            var finished = false
            var incoming = Data()
            let finish = {
                if !finished { finished = true; self.clients -= 1; connection.cancel() }
            }
            connection.start(queue: .main)
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { finish() }
            func receive() {
                connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, complete, error in
                    guard !finished else { return }
                    if let data { incoming.append(data) }
                    guard incoming.count <= 8192 else { finish(); return }
                    guard let text = String(data: incoming, encoding: .utf8), text.contains("\r\n\r\n") else {
                        if complete || error != nil { finish() } else { receive() }
                        return
                    }
                    let lines = text.components(separatedBy: "\r\n")
                    let parts = lines[0].split(separator: " ")
                    var headers: [String: String] = [:]
                    for line in lines.dropFirst() {
                        guard let colon = line.firstIndex(of: ":") else { continue }
                        let name = line[..<colon].lowercased()
                        if headers[name] != nil { finish(); return }
                        headers[name] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                    }
                    let authorized = headers["authorization"] == "Bearer \(self.token)"
                    let response: (Int, [String: Any])
                    var shouldShutdown = false
                    if !authorized { response = (401, ["error": "Unauthorized"]) }
                    else if parts.count != 3 { response = (400, ["error": "Invalid request"]) }
                    else if parts[0] == "POST", parts[1] == "/service/quit" {
                        shouldShutdown = !self.ownerToken.isEmpty && headers["x-organik-camera-owner"] == self.ownerToken && self.shutdown != nil
                        response = shouldShutdown ? (200, ["stopping": true]) : (403, ["error": "Connector ownership required"])
                    }
                    else { response = self.route?(String(parts[0]), String(parts[1])) ?? (503, ["error": "Not ready"]) }
                    let body = (try? JSONSerialization.data(withJSONObject: response.1)) ?? Data("{}".utf8)
                    let header = "HTTP/1.1 \(response.0) Result\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: \(body.count)\r\n\r\n"
                    connection.send(content: Data(header.utf8) + body, completion: .contentProcessed { _ in
                        finish()
                        if shouldShutdown { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { self.shutdown?() } }
                    })
                }
            }
            receive()
        }
        listener.start(queue: .main)
        self.listener = listener
    }
}
