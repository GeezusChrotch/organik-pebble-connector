import AppKit
import Foundation
import Security

struct ConnectorError: LocalizedError { let message: String; var errorDescription: String? { message } }
func scrollingDocument(_ content: NSView) -> NSView {
    let scroll = NSScrollView()
    scroll.hasVerticalScroller = true
    scroll.drawsBackground = false
    content.translatesAutoresizingMaskIntoConstraints = false
    scroll.documentView = content
    content.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor).isActive = true
    content.heightAnchor.constraint(greaterThanOrEqualTo: scroll.contentView.heightAnchor).isActive = true
    return scroll
}
func runCommand(_ executable: String, _ arguments: [String], timeout: Double = 12, discardStandardError: Bool = false) -> (Int32, String) {
    let process = Process(), pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.environment = commandEnvironment(executable: executable, inherited: ProcessInfo.processInfo.environment)
    process.standardOutput = pipe; process.standardError = discardStandardError ? FileHandle.nullDevice : pipe
    process.standardInput = FileHandle.nullDevice
    do { try process.run() } catch { return (-1, error.localizedDescription) }
    DispatchQueue.global().asyncAfter(deadline: .now()+timeout) { if process.isRunning { process.terminate() } }
    let output = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    return (process.terminationStatus, String(decoding: output, as: UTF8.self))
}
func commandEnvironment(executable: String, inherited: [String: String]) -> [String: String] {
    var environment = inherited
    // The macOS Tailscale executable selects GUI or CLI mode from terminal
    // environment variables. Finder/login launches do not supply TERM.
    if URL(fileURLWithPath: executable).lastPathComponent.lowercased() == "tailscale", environment["TERM"]?.isEmpty != false {
        environment["TERM"] = "dumb"
    }
    return environment
}
enum PrivateConnection {
    enum Plan: Equatable { case reuse(String); case create(Int) }
    static var executable: String? {
        ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale"].first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    static func configuration() throws -> [String: Any] {
        guard let binary = executable else { throw ConnectorError(message: "Install Tailscale on your Mac and phone, and sign into the same account.") }
        let started = Date()
        let result = runCommand(binary, ["serve", "status", "--json"], discardStandardError: true)
        var diagnostic: [String: Any] = ["exitStatus": result.0, "stdoutBytes": result.1.utf8.count, "seconds": Date().timeIntervalSince(started)]
        defer {
            let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Organik Apps Pebble Connector")
            if let data = try? JSONSerialization.data(withJSONObject: diagnostic) {
                try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let file = folder.appendingPathComponent("PrivateRouteCheck.json")
                try? data.write(to: file, options: .atomic)
                try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            }
        }
        guard result.0 == 0, let data = result.1.data(using: .utf8) else { throw ConnectorError(message: "Tailscale is not ready. Open it and check your connection.") }
        do {
            let parsed = try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
            let configuration = parsed as? [String: Any] ?? [:]
            diagnostic["webEntries"] = (configuration["Web"] as? [String: Any])?.count ?? 0
            return configuration
        } catch {
            diagnostic["parseError"] = (error as NSError).code
            throw error
        }
    }
    static func origin(target: String, configuration: [String: Any]) -> String? {
        let web = configuration["Web"] as? [String: Any] ?? [:]
        let funnel = configuration["AllowFunnel"] as? [String: Bool] ?? [:]
        for (host, value) in web {
            guard funnel[host] != true,
                  let entry = value as? [String: Any], let handlers = entry["Handlers"] as? [String: Any],
                  let root = handlers["/"] as? [String: Any], let proxy = root["Proxy"] as? String,
                  canonical(proxy) == canonical(target) else { continue }
            return "https://" + host
        }
        return nil
    }
    static func canonical(_ value: String) -> String {
        guard let url = URL(string: value), url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { return value }
        let host = url.host == "localhost" ? "127.0.0.1" : url.host ?? ""
        return "\(url.scheme ?? "http")://\(host):\(url.port ?? 80)\(url.path == "/" ? "" : url.path)"
    }
    static func plan(target: String, port: Int, configuration config: [String: Any]) throws -> Plan {
        if let existing = origin(target: target, configuration: config) { return .reuse(existing) }
        let web = config["Web"] as? [String: Any] ?? [:]
        let tcp = config["TCP"] as? [String: Any] ?? [:]
        if web.keys.contains(where: { $0.hasSuffix(":\(port)") }) || tcp[String(port)] != nil {
            throw ConnectorError(message: "Private port \(port) is already assigned. Its existing route was preserved. Choose another private port.")
        }
        return .create(port)
    }
    static func start(target: String, port: Int) throws -> String {
        let config = try configuration()
        if case .reuse(let existing) = try plan(target: target, port: port, configuration: config) { return existing }
        guard let binary = executable else { throw ConnectorError(message: "Install Tailscale first.") }
        let result = runCommand(binary, ["serve", "--bg", "--yes", "--https=\(port)", target])
        guard result.0 == 0, let origin = origin(target: target, configuration: try configuration()) else {
            throw ConnectorError(message: "The private route could not be started. Check Tailscale and whether Serve is enabled for your account.")
        }
        return origin
    }
}
enum ConnectorSecrets {
    static func token() throws -> String {
        let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"org.organikapps.pebble.stonenotes",kSecAttrAccount as String:"phone-token", kSecReturnData as String:true]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let text = String(data:data,encoding:.utf8) { return text }
        guard status == errSecItemNotFound else { throw ConnectorError(message: "Unlock your login Keychain, then start Notesy again.") }
        var bytes = [UInt8](repeating:0,count:32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw ConnectorError(message: "Could not create a pairing credential.") }
        let value = Data(bytes).base64EncodedString()
        var add = query; add.removeValue(forKey:kSecReturnData as String); add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(add as CFDictionary,nil) == errSecSuccess else { throw ConnectorError(message: "Could not store the pairing credential in Keychain.") }
        return value
    }
}
func bundledNode() throws -> URL {
#if arch(arm64)
    let name = "node-arm64"
#else
    let name = "node-x64"
#endif
    guard let url = Bundle.main.resourceURL?.appendingPathComponent("Beepster/"+name), FileManager.default.isExecutableFile(atPath:url.path) else { throw ConnectorError(message:"The bundled runtime is missing. Reinstall the connector.") }
    return url
}
func jsonRequest(_ url: URL, token: String? = nil, body: [String: Any]? = nil) async throws -> [String: Any] {
    var request = URLRequest(url:url,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:8)
    if let token { request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization") }
    if let body { request.httpMethod="POST";request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=try JSONSerialization.data(withJSONObject:body) }
    let (data,response) = try await URLSession.shared.data(for:request)
    let object = (try? JSONSerialization.jsonObject(with:data)) as? [String:Any] ?? [:]
    guard let http=response as? HTTPURLResponse,(200..<300).contains(http.statusCode) else { throw ConnectorError(message:object["error"] as? String ?? "The service could not be reached.") }
    return object
}
