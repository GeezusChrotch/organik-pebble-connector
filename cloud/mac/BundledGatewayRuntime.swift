import Foundation
import Darwin

// Owns only the Process created here. Never discovers or terminates another
// installed gateway, and never installs executable code outside the app bundle.
final class BundledGatewayRuntime {
    private let lock = NSLock()
    private var process: Process?
    private var mediaInput: Pipe?
    private var mediaOutput: Pipe?
    private let mediaQueue = DispatchQueue(label: "org.organikapps.beepster.media")
    private var shuttingDown = false
    var isRunning: Bool { lock.lock(); defer { lock.unlock() }; return process?.isRunning == true }
    func start(executable: URL, arguments: [String], workingDirectory: URL, environment: [String: String], mediaHandler: (([String: Any]) -> [String: Any])? = nil) throws {
        lock.lock(); defer { lock.unlock() }
        guard !shuttingDown else { throw CocoaError(.userCancelled) }
        guard process?.isRunning != true else { return }
        let child = Process()
        child.executableURL = executable
        child.arguments = arguments
        child.currentDirectoryURL = workingDirectory
        child.environment = ProcessInfo.processInfo.environment.merging(environment) { _, new in new }
        child.standardInput = FileHandle.nullDevice
        child.standardOutput = FileHandle.nullDevice
        child.standardError = FileHandle.nullDevice
        if let mediaHandler {
            let input = Pipe(), output = Pipe()
            fcntl(input.fileHandleForWriting.fileDescriptor, F_SETNOSIGPIPE, 1)
            mediaInput = input; mediaOutput = output
            child.standardInput = input; child.standardOutput = output
            child.environment?["BEEPSTER_NATIVE_MEDIA"] = "1"
            var buffer = Data()
            output.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else { handle.readabilityHandler = nil; return }
                self?.mediaQueue.async {
                    buffer.append(data)
                    while let newline = buffer.firstIndex(of: 10) {
                        let line = buffer.prefix(upTo: newline); buffer.removeSubrange(...newline)
                        guard line.count < 16384, let text = String(data: line, encoding: .utf8), text.hasPrefix("BEEPSTER_MEDIA "),
                              let json = text.dropFirst(15).data(using: .utf8),
                              let request = (try? JSONSerialization.jsonObject(with: json)) as? [String: Any],
                              let id = request["id"] as? String, UUID(uuidString: id) != nil else { continue }
                        var result = mediaHandler(request); result["id"] = id
                        if var encoded = try? JSONSerialization.data(withJSONObject: result) {
                            encoded.append(10); try? input.fileHandleForWriting.write(contentsOf: encoded)
                        }
                    }
                    if buffer.count > 16384 { buffer.removeAll() }
                }
            }
        }
        try child.run()
        process = child
    }
    func stop(permanently: Bool = false) {
        lock.lock(); defer { lock.unlock() }
        if permanently { shuttingDown = true }
        if let child = process, child.isRunning {
            child.terminate()
            child.waitUntilExit()
        }
        mediaOutput?.fileHandleForReading.readabilityHandler = nil
        mediaInput = nil; mediaOutput = nil
        process = nil
    }
}
