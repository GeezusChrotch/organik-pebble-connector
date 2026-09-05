#!/usr/bin/env python3
"""Stage upstream adapters for manual comparison; never overwrite integrated modules."""
from pathlib import Path
import os, shutil, subprocess, json
root = Path(__file__).resolve().parents[1]
parent = root.parent
staging = root / 'build' / 'upstream-reference'
(staging / 'mac').mkdir(parents=True, exist_ok=True)
(staging / 'vendor').mkdir(exist_ok=True)
beepster = Path(os.environ.get('BEEPSTER_SOURCE', parent / 'beepster'))
reminderz = Path(os.environ.get('REMINDERZ_SOURCE', parent / 'Reminderz'))
def replace(text, old, new):
    assert old in text, f'Upstream shape changed: {old[:80]}'
    return text.replace(old, new, 1)
b = (beepster/'mac/BeepsterConnector.swift').read_text()
b = b[:b.index('\nif CommandLine.arguments.contains(')]
b = replace(b, 'final class AppDelegate: NSObject, NSApplicationDelegate {', 'final class BeepsterModule: NSObject {')
b = replace(b, 'private var window: NSWindow!', 'private var window: NSWindow! { NSApp.keyWindow ?? NSApp.windows.first }')
start = b.index('    func applicationDidFinishLaunching(')
end = b.index('        let stack = NSStackView()', start)
b = b[:start] + '    func makeContent() -> NSView {\n        let content = NSView()\n' + b[end:]
b = replace(b, '        window.makeKeyAndOrderFront(nil)\n        NSApp.activate(ignoringOtherApps: true)\n        refresh()\n    }', '        stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24).isActive = true\n        refresh()\n        return scrollingDocument(content)\n    }')
start = b.index('        let oldFrame = window.frame')
end = b.index('\n    }',start)
b = b[:start] + b[end:]
b = b.replace('Bundle.main.resourceURL?.appendingPathComponent(name)', 'Bundle.main.resourceURL?.appendingPathComponent("Beepster").appendingPathComponent(name)')
b = b.replace('"Beepster Connector"', '"Beepster"')
b = b.replace('advancedToggle.bezelStyle = .disclosure', 'advancedToggle.bezelStyle = .rounded')
b = b.replace('self.run(binary, ["serve", "--bg", "8794"])', '(try? PrivateConnection.start(target: "http://127.0.0.1:8794", port: 10444))')
b = b.replace('if let binary = self.tailscaleBinary(), tailscaleConnected {', 'if self.tailscaleBinary() != nil, tailscaleConnected {')
b = b.replace('@objc private func startPrivateRoute() {\n        guard let binary = tailscaleBinary() else {', '@objc private func startPrivateRoute() {\n        guard tailscaleBinary() != nil else {')
b = b.replace('    private func wrappingLabel(', '    var overviewStatus: String { setupSummary?.stringValue ?? "Not checked" }\n\n    private func wrappingLabel(')
(staging/'mac/BeepsterModule.swift').write_text(b)
r = (reminderz/'mac/ReminderzConnector.swift').read_text()
r = r[:r.index('\nprivate let application = NSApplication.shared')]
r = replace(r, 'private final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {', 'final class ReminderzModule: NSObject, NSWindowDelegate {')
r = replace(r, 'private var window: NSWindow!', 'private var window: NSWindow! { NSApp.keyWindow ?? NSApp.windows.first }')
start = r.index('    func applicationDidFinishLaunching(')
end = r.index('        summary.stringValue =',start)
r = r[:start]+'    func makeContent() -> NSView {\n        let content = buildContent()\n'+r[end:]
end = r.index('\n    func applicationShouldTerminateAfterLastWindowClosed',start)
segment=r[start:end]
segment=segment.rsplit('\n    }',1)[0]+'\n        return content\n    }\n'
r=r[:start]+segment+r[end:]
start=r.index('    private func buildWindow()')
end=r.index('        let stack = NSStackView()',start)
r=r[:start]+'    private func buildContent() -> NSView {\n        let content = NSView()\n'+r[end:]
r=replace(r,'        window.makeKeyAndOrderFront(nil)\n        NSApp.activate(ignoringOtherApps: true)\n    }','        stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24).isActive = true\n        return scrollingDocument(content)\n    }')
r=r.replace('Reminderz Connector from Applications','Organik Apps Pebble Connector from Applications')
r=r.replace('allow Reminderz Connector','allow Organik Apps Pebble Connector')
r=r.replace('Allow Reminderz Connector','Allow Organik Apps Pebble Connector')
r=r.replace('"Reminderz Connector"','"Reminderz"')
r=r.replace('    private func label(', '    var overviewStatus: String { summary?.stringValue ?? "Not checked" }\n    func stopModule() { stopService(restart: false) }\n\n    private func label(')
r=r.replace('case .failure(let error):', 'case .failure:')
start=r.index('    @objc private func startPrivateSync()')
end=r.index('\n    @objc private func stopPrivateSync()', start)
r=r[:start]+'''    @objc private func startPrivateSync() {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                _ = try PrivateConnection.start(target: "http://127.0.0.1:7843", port: 10447)
                DispatchQueue.main.async { self.refresh() }
            } catch {
                DispatchQueue.main.async { self.showAlert("Private sync needs attention", error.localizedDescription) }
            }
        }
    }
'''+r[end:]
start=r.index('    private static func privateOrigin()')
end=r.index('\n    private static func localHealth',start)
r=r[:start]+'''    private static func privateOrigin() -> String? {
        guard let configuration = try? PrivateConnection.configuration() else { return nil }
        return PrivateConnection.origin(target: "http://127.0.0.1:7843", configuration: configuration)
    }
'''+r[end:]
r=replace(r,'    @objc private func stopPrivateSync() {','    @objc private func stopPrivateSync() {\n        guard let origin = Self.privateOrigin(), let url = URL(string: origin) else { return }\n        let activePort = String(url.port ?? 443)')
r=replace(r,'This removes only the Reminderz HTTPS route on port \\(servePort).','This removes only the Reminderz HTTPS route on port \\(activePort).')
r=replace(r,'["serve", "--yes", "--https=\\(servePort)", "off"]','["serve", "--yes", "--https=\\(activePort)", "off"]')
r=r.replace('text: "Mac service: \\(error.localizedDescription)"','text: "Mac service unavailable. If the standalone Reminderz Connector is running, stop its service before starting this one. Existing pairing is preserved."')
r=replace(r,'        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,','        let status = SecItemCopyMatching(query as CFDictionary, &item)\n        if status == errSecSuccess,')
r=replace(r,'        var bytes = [UInt8](repeating: 0, count: 32)','        guard status == errSecItemNotFound else { return "" }\n        var bytes = [UInt8](repeating: 0, count: 32)')
r=replace(r,'        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)','        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return "" }')
r=replace(r,'        SecItemAdd(add as CFDictionary, nil)\n        return value','        guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { return "" }\n        return value')
(staging/'mac/ReminderzModule.swift').write_text(r)
manifest={}
for name,source in [('Beepster',beepster),('Reminderz',reminderz)]:
    (staging/'vendor'/f'{name}-LICENSE.txt').write_text((source/'LICENSE').read_text().rstrip()+'\n')
    manifest[name]={'commit':subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()}
(staging/'vendor/versions.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Staged upstream reference in build/upstream-reference; integrated modules unchanged.')
