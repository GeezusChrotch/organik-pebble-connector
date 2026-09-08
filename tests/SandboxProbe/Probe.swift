import Foundation
import AppKit

func command(_ executable: String, _ arguments: [String]) -> [String: Any] {
    let child = Process(), pipe = Pipe()
    child.executableURL = URL(fileURLWithPath: executable)
    child.arguments = arguments
    let syntheticGateway = arguments.contains { $0.hasSuffix("gateway-probe.mjs") || $0.hasSuffix("notesy-probe.cjs") }
    child.standardOutput = pipe; child.standardError = syntheticGateway ? pipe : FileHandle.nullDevice
    child.standardInput = FileHandle.nullDevice
    var env = ProcessInfo.processInfo.environment; env["TERM"] = "dumb"; child.environment = env
    do { try child.run() } catch { return ["launchError": (error as NSError).code] }
    DispatchQueue.global().asyncAfter(deadline: .now()+8) { if child.isRunning { child.terminate() } }
    let data = pipe.fileHandleForReading.readDataToEndOfFile(); child.waitUntilExit()
    let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    return ["exitStatus": child.terminationStatus, "stdoutBytes": data.count,
            "json": parsed != nil, "webEntries": (parsed?["Web"] as? [String: Any])?.count ?? 0,
            "node": parsed?["probe"] ?? NSNull(),
            "syntheticError": syntheticGateway && child.terminationStatus != 0 ? String(decoding: data.prefix(1800), as: UTF8.self) : ""]
}
@main struct SandboxProbe { static func main() throws {
var result: [String: Any] = [:]
let manager = FileManager.default
if let shared = manager.containerURL(forSecurityApplicationGroupIdentifier: "group.org.organikapps.pebbleconnector") {
    let file = shared.appendingPathComponent("sandbox-probe-" + UUID().uuidString)
    do { try Data("probe".utf8).write(to: file, options: .atomic); result["appGroupWrite"] = true; try manager.removeItem(at: file) }
    catch { result["appGroupWrite"] = false; result["appGroupError"] = (error as NSError).code }
} else { result["appGroupWrite"] = false }
result["tailscale"] = command("/Applications/Tailscale.app/Contents/MacOS/Tailscale", ["serve", "status", "--json"])
if let node = Bundle.main.url(forResource: "node", withExtension: nil) {
    result["bundledNode"] = command(node.path, ["-e", "console.log(JSON.stringify({probe:{node:process.versions.node,tmpWrite:(()=>{const fs=require('fs'),os=require('os'),p=require('path').join(os.tmpdir(),'organik-probe-'+process.pid);fs.writeFileSync(p,'ok');fs.unlinkSync(p);return true})()}}))"])
}
if let node = Bundle.main.url(forResource: "node", withExtension: nil),
   let script = Bundle.main.url(forResource: "gateway-probe", withExtension: "mjs") {
    result["gatewayIntegration"] = command(node.path, [script.path])
}
let folder = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
try manager.createDirectory(at: folder, withIntermediateDirectories: true)
let bookmarkFile = folder.appendingPathComponent("SandboxProbe-vault.bookmark")
var selected: URL?
if let index = CommandLine.arguments.firstIndex(of: "--choose-vault-fixture"), CommandLine.arguments.count > index + 1 {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let panel = NSOpenPanel()
    panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = false
    panel.directoryURL = URL(fileURLWithPath: CommandLine.arguments[index + 1])
    panel.message = "Select only the synthetic Organik sandbox test vault. No personal notes are needed."
    panel.prompt = "Use test vault"
    if panel.runModal() == .OK, let url = panel.url {
        selected = url
        try url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil).write(to: bookmarkFile, options: .atomic)
    }
} else if CommandLine.arguments.contains("--reuse-vault-fixture") {
    var stale = false
    selected = try URL(resolvingBookmarkData: Data(contentsOf: bookmarkFile), options: [.withSecurityScope,.withoutUI], relativeTo: nil, bookmarkDataIsStale: &stale)
    result["bookmarkStale"] = stale
}
if let selected, let node = Bundle.main.url(forResource: "node", withExtension: nil) {
    let scoped = selected.startAccessingSecurityScopedResource()
    defer { if scoped { selected.stopAccessingSecurityScopedResource() } }
    result["securityScopeStarted"] = scoped
    if let script = Bundle.main.url(forResource: "notesy-probe", withExtension: "cjs") {
        result["notesyIntegration"] = command(node.path, [script.path, selected.path])
    }
    result["vaultParentRead"] = (try? String(contentsOf: selected.appendingPathComponent("fixture.md"), encoding: .utf8)) == "Organik sandbox fixture\n"
    result["vaultChildRead"] = command(node.path, ["-e", "const fs=require('fs');console.log(JSON.stringify({probe:{vaultRead:fs.readFileSync(process.argv[1],'utf8')==='Organik sandbox fixture\\n'}}))", selected.appendingPathComponent("fixture.md").path])
}
let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted,.sortedKeys])
try data.write(to: folder.appendingPathComponent("OrganikSandboxProbe.json"), options: .atomic)
FileHandle.standardOutput.write(data)

} }
