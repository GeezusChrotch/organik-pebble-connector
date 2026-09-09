import Foundation

// Owns only the Process created here. Never discovers or terminates another
// installed gateway, and never installs executable code outside the app bundle.
final class BundledGatewayRuntime {
    private let lock = NSLock()
    private var process: Process?
    private var shuttingDown = false
    var isRunning: Bool { lock.lock(); defer { lock.unlock() }; return process?.isRunning == true }
    func start(executable: URL, arguments: [String], workingDirectory: URL, environment: [String: String]) throws {
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
        process = nil
    }
}
