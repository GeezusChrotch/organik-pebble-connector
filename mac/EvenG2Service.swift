import AppKit
import SwiftUI
import Security

@MainActor final class EvenG2Service: ObservableObject {
    @Published var running = false
    @Published var busy = false
    @Published var origin = ""
    @Published var message = "Start the G2 connection to use Pome with this Mac’s Apple Home."
    @Published var speechURL = UserDefaults.standard.string(forKey: "even.speechURL") ?? ""
    @Published var speechModel = UserDefaults.standard.string(forKey: "even.speechModel") ?? "whisper-1"
    @Published var useLocalSpeech = UserDefaults.standard.object(forKey: "even.localSpeech") as? Bool ?? (UserDefaults.standard.string(forKey:"even.speechURL") ?? "").isEmpty
    @Published var speechKey = ""
    @Published var dictationReady = false
    private var process: Process?
    private var clientToken = ""
    private var speechSetup: Process?
    private var speechDirectory: URL {FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Organik Apps Pebble Connector/Speech/parakeet-tdt-0.6b-v3-coreml",isDirectory:true)}
    private func prepareSpeech(_ binary: URL) async throws {
        message = "Preparing free local Parakeet dictation. The first setup downloads the model and may take several minutes."
        let child = Process(); child.executableURL = binary; child.arguments = ["prepare",speechDirectory.path]
        child.standardOutput = FileHandle.nullDevice; child.standardError = FileHandle.nullDevice
        var env = ProcessInfo.processInfo.environment; env["OS_ACTIVITY_MODE"] = "disable"; child.environment = env
        speechSetup = child
        defer {speechSetup = nil}
        try child.run()
        for _ in 0..<2400 {
            if !child.isRunning {break}
            try await Task.sleep(nanoseconds:250_000_000)
        }
        if child.isRunning {child.terminate();throw ConnectorError(message:"Model setup timed out. Check your internet connection and retry.")}
        guard child.terminationStatus == 0 else {throw ConnectorError(message:"Local Parakeet setup failed. Check your internet connection and available disk space, then retry.")}
    }
    private let target = "http://127.0.0.1:7858"
    private func credential(_ account: String, save: String? = nil) throws -> String {
        let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"org.organikapps.even",kSecAttrAccount as String:account]
        if let save {
            let data = Data(save.utf8)
            var status = SecItemUpdate(query as CFDictionary,[kSecValueData as String:data] as CFDictionary)
            if status == errSecItemNotFound {var item = query;item[kSecValueData as String] = data;status = SecItemAdd(item as CFDictionary,nil)}
            guard status == errSecSuccess else {throw ConnectorError(message:"Unlock Keychain to save the G2 connection.")}
            return save
        }
        var read = query;read[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary,&result)
        if status == errSecItemNotFound {return ""}
        guard status == errSecSuccess, let data = result as? Data, let value = String(data:data,encoding:.utf8) else {throw ConnectorError(message:"Unlock Keychain to read the G2 connection.")}
        return value
    }
    func start(home: PomeCameraService) {
        guard !busy else {return};busy = true
        Task {
            defer {busy = false}
            do {
                guard await home.connectLocalCameraService() else {throw ConnectorError(message:"Connect Apple Home first, then start the G2 connection.")}
                let homeToken = try home.sharedG2Credential()
                let saved = try credential("client")
                clientToken = saved.isEmpty ? try credential("client",save:UUID().uuidString + UUID().uuidString) : saved
                if !speechKey.isEmpty {_ = try credential("speech",save:speechKey);speechKey = ""}
                let provider = useLocalSpeech ? "" : speechURL.trimmingCharacters(in:.whitespacesAndNewlines)
                if !provider.isEmpty {
                    guard let url = URL(string:provider),url.user == nil,url.password == nil,url.query == nil,url.fragment == nil,
                        url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1","localhost","::1"].contains(url.host ?? "")) else {throw ConnectorError(message:"Use an HTTPS speech endpoint, or HTTP on localhost.")}
                }
                guard let resources = Bundle.main.resourceURL else {return}
#if arch(arm64)
                let node = resources.appendingPathComponent("Beepster/node-arm64")
#else
                let node = resources.appendingPathComponent("Beepster/node-x64")
#endif
                let script = resources.appendingPathComponent("EvenG2/server.mjs")
                guard FileManager.default.isExecutableFile(atPath:node.path),FileManager.default.fileExists(atPath:script.path) else {throw ConnectorError(message:"This build is missing the Even G2 runtime.")}
                let speechBinary = resources.appendingPathComponent("Speech/organik-speech")
                if useLocalSpeech {
#if arch(arm64)
                    guard FileManager.default.isExecutableFile(atPath:speechBinary.path) else {throw ConnectorError(message:"This build is missing local dictation.")}
                    try await prepareSpeech(speechBinary)
#else
                    throw ConnectorError(message:"Local Parakeet requires Apple Silicon. Choose a custom provider on this Mac.")
#endif
                }
                stop()
                let child = Process();child.executableURL = node;child.arguments = [script.path]
                let input = Pipe();child.standardInput = input;child.standardOutput = FileHandle.nullDevice;child.standardError = FileHandle.nullDevice
                child.terminationHandler = { [weak self] stopped in
                    Task { @MainActor in
                        guard let self, self.process === stopped else { return }
                        self.process = nil; self.running = false; self.origin = ""; self.dictationReady = false
                        self.message = "G2 service stopped. Start the connection again."
                    }
                }
                try child.run();process = child
                var config: [String:String] = ["clientToken":clientToken,"homeToken":homeToken,"speechBaseURL":provider,"speechModel":speechModel,"speechToken":try credential("speech")]
                if useLocalSpeech {config["localSpeechBinary"] = speechBinary.path;config["localSpeechModels"] = speechDirectory.path;config["speechModel"] = "parakeet-tdt-0.6b-v3"}
                input.fileHandleForWriting.write(try JSONSerialization.data(withJSONObject:config));try? input.fileHandleForWriting.close()
                var ready = false
                for _ in 0..<20 {
                    try await Task.sleep(nanoseconds:200_000_000)
                    if let health = try? await jsonRequest(URL(string:target + "/health")!,token:clientToken),health["service"] as? String == "org.organikapps.even" {ready = true;break}
                    if !child.isRunning {break}
                }
                guard ready else {stop();throw ConnectorError(message:"The G2 service could not start. Check that port 7858 is available.")}
                UserDefaults.standard.set(useLocalSpeech,forKey:"even.localSpeech");UserDefaults.standard.set(speechURL,forKey:"even.speechURL");UserDefaults.standard.set(speechModel,forKey:"even.speechModel")
                UserDefaults.standard.set(true,forKey:"even.enabled")
                running = true;dictationReady = useLocalSpeech || !provider.isEmpty
                let route = try await Task.detached {try PrivateConnection.start(target:"http://127.0.0.1:7858",port:10558)}.value
                _ = route
                let configuration = try await Task.detached {try PrivateConnection.configuration()}.value
                origin = PrivateConnection.origin(target:target,configuration:configuration) ?? ""
                guard !origin.isEmpty else {throw ConnectorError(message:"G2 service started, but its private address is unavailable.")}
                let check = try await jsonRequest(URL(string:origin + "/health")!,token:clientToken)
                guard check["service"] as? String == "org.organikapps.even" else {throw ConnectorError(message:"The private G2 route could not be verified.")}
                message = "Mac connection ready. Pair Pome in the Even phone app, then test on your glasses."
            } catch {message = error.localizedDescription}
        }
    }
    func stop() {
        if let speechSetup,speechSetup.isRunning {speechSetup.terminate()}
        if let process,process.isRunning {process.terminate();process.waitUntilExit()}
        process = nil;running = false;origin = "";dictationReady = false
    }
    func disconnect() {UserDefaults.standard.set(false,forKey:"even.enabled");stop();message = "G2 connection stopped. Pebble remains connected."}
    func copyPairing() {
        guard running,!origin.isEmpty,!clientToken.isEmpty else {return}
        let value = ["url":origin,"token":clientToken]
        guard let data = try? JSONSerialization.data(withJSONObject:value),let text = String(data:data,encoding:.utf8) else {return}
        NSPasteboard.general.clearContents();NSPasteboard.general.setString(text,forType:.string)
        let generation = NSPasteboard.general.changeCount
        DispatchQueue.main.asyncAfter(deadline:.now()+120) {if NSPasteboard.general.changeCount == generation {NSPasteboard.general.clearContents()}}
        message = "Pairing copied. Paste it into Pome’s Even phone settings. Clipboard clears after two minutes."
    }
}
