#if APP_STORE
import AppKit
import Combine
import Security
import LocalAuthentication
import Darwin

final class StoreAgentConfiguration: ObservableObject {
    @Published var hermesURL = UserDefaults.standard.string(forKey: "store.hermes.bridgeURL") ?? ""
    @Published var tokenInput = ""
    @Published var openClawFolder = "Not selected"
    @Published var message = "Connect agents using their existing services."
    private let lock = NSLock()
    private let tokenLock = NSLock()
    private var cachedToken: String?
    private var selectedOpenClaw: URL?
    private var selectedAttachments: URL?
    private var activeScopes: [URL] = []
    private var savedHermesURL = ""
    private let bookmarkKey = "store.openclaw.bookmark"
    private var tokenQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "org.organikapps.pebbleconnector.store-agents", kSecAttrAccount as String: "hermes-bridge-token"]
    }
    init() {
        savedHermesURL = hermesURL
        if let data = UserDefaults.standard.data(forKey: "store.attachments.bookmark") {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: data, options: [.withSecurityScope,.withoutUI], relativeTo: nil, bookmarkDataIsStale: &stale), url.startAccessingSecurityScopedResource() {
                selectedAttachments = url; activeScopes.append(url)
            }
        }
        if let data = UserDefaults.standard.data(forKey: bookmarkKey) {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: data, options: [.withSecurityScope,.withoutUI], relativeTo: nil, bookmarkDataIsStale: &stale), url.startAccessingSecurityScopedResource() {
                selectedOpenClaw = url; activeScopes.append(url); openClawFolder = url.lastPathComponent
            }
        }
    }
    func chooseAttachments() -> Bool {
        lock.lock(); let existing = selectedAttachments; lock.unlock()
        if let existing, FileManager.default.isReadableFile(atPath: existing.path) {
            message = "Using the saved attachments folder."
            return true
        }
        let panel = NSOpenPanel()
        panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = false
        panel.showsHiddenFiles = true
        // NSHomeDirectory points into our sandbox. Resolve the account's home
        // for the picker only; access still requires the user's selection.
        var account = passwd()
        var found: UnsafeMutablePointer<passwd>?
        var buffer = [CChar](repeating: 0, count: 32_768)
        let home = buffer.withUnsafeMutableBufferPointer { storage -> URL? in
            guard getpwuid_r(getuid(), &account, storage.baseAddress, storage.count, &found) == 0,
                  found != nil, let directory = account.pw_dir else { return nil }
            return URL(fileURLWithPath: String(cString: directory), isDirectory: true)
        }
        // Do not preflight existence: the sandbox can deny that check before
        // the open panel grants access, even when the folder exists.
        panel.directoryURL = existing ?? home?.appendingPathComponent("Library/Messages/Attachments", isDirectory: true)
        panel.message = "Confirm the Messages Attachments folder to allow photos and GIFs. If it is unavailable, use Go to Folder (Command–Shift–G) and enter ~/Library/Messages/Attachments, or choose your attachments folder."
        panel.prompt = "Use attachments folder"
        guard panel.runModal() == .OK, let url = panel.url else { return false }
        do {
            let bookmark = try url.bookmarkData(options: [.withSecurityScope,.securityScopeAllowOnlyReadAccess], includingResourceValuesForKeys: nil, relativeTo: nil)
            guard url.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
            lock.lock(); selectedAttachments = url; activeScopes.append(url); lock.unlock()
            UserDefaults.standard.set(bookmark, forKey: "store.attachments.bookmark")
            return true
        } catch { message = "Could not save attachments access: " + error.localizedDescription; return false }
    }
    deinit { activeScopes.forEach { $0.stopAccessingSecurityScopedResource() } }
    func chooseOpenClaw() -> Bool {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = false
        panel.showsHiddenFiles = true
        panel.message = "Choose your OpenClaw data folder to read Telegram sessions and save linked-thread prompt settings."
        panel.prompt = "Use OpenClaw folder"
        guard panel.runModal() == .OK, let url = panel.url else { return false }
        do {
            let bookmark = try url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
            guard url.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
            lock.lock(); selectedOpenClaw = url; activeScopes.append(url); lock.unlock()
            UserDefaults.standard.set(bookmark, forKey: bookmarkKey)
            openClawFolder = url.lastPathComponent
            message = "OpenClaw data access saved."
            return true
        } catch { message = "Could not save folder access: " + error.localizedDescription; return false }
    }
    func saveHermes() -> Bool {
        let endpoint = hermesURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: endpoint), url.scheme == "http", ["127.0.0.1", "localhost", "::1"].contains(url.host ?? ""),
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else {
            message = "Use the Hermes bridge’s local HTTP address, without credentials in the URL."; return false
        }
        let secret = tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if !secret.isEmpty {
            guard secret.count >= 32, secret.count <= 512, secret.allSatisfy({ $0.isHexDigit }) else {
                message = "Use the bridge token containing at least 32 hexadecimal characters."; return false
            }
            let attributes = [kSecValueData as String: Data(secret.utf8)]
            var status = SecItemUpdate(tokenQuery as CFDictionary, attributes as CFDictionary)
            if status == errSecItemNotFound {
                status = SecItemAdd(tokenQuery.merging(attributes) { _, new in new } as CFDictionary, nil)
            }
            guard status == errSecSuccess else { message = "Could not save the bridge token in Keychain."; return false }
            tokenLock.lock(); cachedToken = secret; tokenLock.unlock()
        }
        guard readToken() != nil else { message = "Enter the Hermes bridge token."; return false }
        lock.lock(); savedHermesURL = endpoint; lock.unlock()
        UserDefaults.standard.set(endpoint, forKey: "store.hermes.bridgeURL")
        tokenInput = ""; message = "Hermes connection saved. Check agent connections to verify it."
        return true
    }
    private func readToken() -> String? {
        // Background status commands share one credential read. With legacy
        // Keychain ACLs, parallel reads can each produce an authorization prompt.
        tokenLock.lock(); defer { tokenLock.unlock() }
        if let cachedToken { return cachedToken }
        var query = tokenQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        let context = LAContext(); context.interactionNotAllowed = true
        query[kSecUseAuthenticationContext as String] = context
        var value: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess, let data = value as? Data else { return nil }
        cachedToken = String(data: data, encoding: .utf8)
        return cachedToken
    }
    func environment() -> [String: String] {
        lock.lock(); let root = selectedOpenClaw?.path; let endpoint = savedHermesURL; let attachments = selectedAttachments?.path; lock.unlock()
        let state = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Beepster")
        var result = ["BEEPSTER_DISTRIBUTION": "app-store", "BEEPSTER_STATE_DIR": state.path,
                      "BEEPSTER_OPENCLAW_STATE_DIR": state.appendingPathComponent("openclaw").path]
        if let root { result["BEEPSTER_OPENCLAW_HOME"] = root }
        if let attachments { result["BEEPSTER_ATTACHMENTS_DIR"] = attachments }
        if !endpoint.isEmpty, let token = readToken() {
            result["BEEPSTER_HERMES_BRIDGE_URL"] = endpoint
            result["BEEPSTER_HERMES_BRIDGE_TOKEN"] = token
        }
        return result
    }
}
#endif
