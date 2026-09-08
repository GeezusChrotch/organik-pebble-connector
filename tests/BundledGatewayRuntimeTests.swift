import Foundation
@main struct BundledGatewayRuntimeTests {
    static func main() throws {
        let runtime = BundledGatewayRuntime()
        let dir = FileManager.default.temporaryDirectory
        try runtime.start(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["30"], workingDirectory: dir, environment: [:])
        assert(runtime.isRunning)
        // A second start must reuse the owned child, even with an invalid path.
        try runtime.start(executable: URL(fileURLWithPath: "/missing"), arguments: [], workingDirectory: dir, environment: [:])
        runtime.stop()
        assert(!runtime.isRunning)
        try runtime.start(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["30"], workingDirectory: dir, environment: [:])
        runtime.stop(permanently: true)
        assert(!runtime.isRunning)
        do {
            try runtime.start(executable: URL(fileURLWithPath: "/bin/sleep"), arguments: ["30"], workingDirectory: dir, environment: [:])
            fatalError("A pending launch must not outlive application shutdown")
        } catch {}
        print("PASS: owned child reuse, restart, shutdown and late-launch rejection")
    }
}
