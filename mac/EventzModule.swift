import AppKit
import Combine
import CoreImage
import EventKit
import Foundation
import Network
import Security
import ServiceManagement

private let localPort: NWEndpoint.Port = 7848
private let servePort = "10453"
private let connectorVersion = "1.1.1"

private struct HTTPRequest {
    let method: String
    let path: String
    let headers: [String: String]
    let body: Data
}

private struct PairingCode {
    let origin: String
    let expires: Date
}

private final class EventServer {
    private let store: EKEventStore
    private let token: String
    private let queue = DispatchQueue(label: "org.eventz.http")
    private var listener: NWListener?
    private var pairingCodes: [String: PairingCode] = [:]

    init(store: EKEventStore, token: String) {
        self.store = store
        self.token = token
    }

    func start(completion: @escaping (Result<Void, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: localPort)
            let listener = try NWListener(using: parameters)
            listener.stateUpdateHandler = { state in
                if case .ready = state { DispatchQueue.main.async { completion(.success(())) } }
                if case let .failed(error) = state { DispatchQueue.main.async { completion(.failure(error)) } }
            }
            listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            self.listener = listener
            listener.start(queue: queue)
        } catch { completion(.failure(error)) }
    }

    func stop(completion: @escaping () -> Void) {
        queue.async {
            self.pairingCodes.removeAll()
            guard let listener = self.listener else {
                DispatchQueue.main.async(execute: completion)
                return
            }
            self.listener = nil
            listener.stateUpdateHandler = { state in
                if case .cancelled = state {
                    DispatchQueue.main.async(execute: completion)
                }
            }
            listener.cancel()
        }
    }

    func makePairingURL(origin: String) -> URL? {
        var bytes = [UInt8](repeating: 0, count: 18)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        let code = Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        queue.sync {
            let now = Date()
            pairingCodes = pairingCodes.filter { $0.value.expires > now }
            pairingCodes[code] = PairingCode(origin: origin, expires: now.addingTimeInterval(10 * 60))
        }
        var components = URLComponents(string: origin + "/pair")
        components?.queryItems = [URLQueryItem(name: "code", value: code)]
        return components?.url
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(connection, accumulated: Data())
    }

    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
            guard let self else { return }
            var buffer = accumulated
            if let data { buffer.append(data) }
            if let request = self.parse(buffer) {
                if request.method == "GET", self.requestPath(request.path) == "/pair" {
                    let page = self.redeemPairingPage(request.path)
                    self.respondHTML(connection, status: page == nil ? 410 : 200,
                                     html: page ?? self.expiredPairingPage())
                    return
                }
                self.route(request) { status, value in self.respond(connection, status: status, value: value) }
            } else if error == nil && !complete && buffer.count < 65_536 {
                self.receive(connection, accumulated: buffer)
            } else {
                self.respond(connection, status: 400, value: ["error": "Invalid request"])
            }
        }
    }

    private func requestPath(_ target: String) -> String {
        target.split(separator: "?", maxSplits: 1).first.map(String.init) ?? target
    }

    private func queryValue(named name: String, in target: String) -> String? {
        guard let components = URLComponents(string: "https://eventz.invalid\(target)") else { return nil }
        return components.queryItems?.first(where: { $0.name == name })?.value
    }

    private func redeemPairingPage(_ target: String) -> String? {
        guard let code = queryValue(named: "code", in: target),
              let pairing = pairingCodes.removeValue(forKey: code), pairing.expires > Date() else { return nil }
        let payload = ["gatewayURL": pairing.origin, "gatewayToken": token]
        guard !payload["gatewayURL", default: ""].isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
        let encoded = data.base64EncodedString()
        return pairingPage(encodedPayload: encoded)
    }

    private func pairingPage(encodedPayload: String) -> String {
        """
        <!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
        <title>Pair Eventz</title><style>
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;background:#f2f2f7;color:#111}
        main{max-width:34rem;margin:3rem auto;padding:1.5rem}section{background:white;border-radius:18px;padding:1.5rem;box-shadow:0 8px 30px #0002}
        h1{margin-top:0}button{font:inherit;font-weight:600;width:100%;padding:.9rem;border:0;border-radius:12px;background:#087cff;color:white}
        textarea{box-sizing:border-box;width:100%;height:7rem;margin:.8rem 0;padding:.7rem;border:1px solid #bbb;border-radius:10px;font-family:ui-monospace,monospace;font-size:.75rem}
        #done{color:#187a39;font-weight:600}.steps{line-height:1.45;color:#444}
        </style></head><body><main><section><h1>Pair Eventz</h1>
        <p>This one-time page keeps the pairing details on your iPhone.</p>
        <textarea id="payload" readonly></textarea><button id="copy">Copy pairing details</button>
        <p id="done" hidden>Copied on this iPhone.</p>
        <p class="steps">Now open Pebble → Eventz → Settings, paste into <b>Pairing details</b>, select <b>Test connection</b>, then save.</p>
        </section></main><script>
        const value=atob('\(encodedPayload)');const box=document.getElementById('payload');box.value=value;
        document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(value)}catch(e){box.focus();box.select();document.execCommand('copy')}document.getElementById('done').hidden=false};
        </script></body></html>
        """
    }

    private func expiredPairingPage() -> String {
        """
        <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Pair Eventz</title></head><body style="font-family:-apple-system;margin:3rem">
        <h1>This pairing code has expired</h1><p>On your Mac, choose Connect Phone again to make a fresh one-time QR code.</p>
        </body></html>
        """
    }

    private func parse(_ data: Data) -> HTTPRequest? {
        guard let marker = data.range(of: Data("\r\n\r\n".utf8)),
              let headerText = String(data: data[..<marker.lowerBound], encoding: .utf8) else { return nil }
        let lines = headerText.components(separatedBy: "\r\n")
        guard let first = lines.first else { return nil }
        let parts = first.split(separator: " ")
        guard parts.count >= 2 else { return nil }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            let pair = line.split(separator: ":", maxSplits: 1).map(String.init)
            if pair.count == 2 { headers[pair[0].lowercased()] = pair[1].trimmingCharacters(in: .whitespaces) }
        }
        let bodyStart = marker.upperBound
        let length = Int(headers["content-length"] ?? "0") ?? 0
        guard length >= 0, length <= 65_536, data.count >= bodyStart + length else { return nil }
        return HTTPRequest(method: String(parts[0]), path: String(parts[1]), headers: headers,
                           body: data.subdata(in: bodyStart..<(bodyStart + length)))
    }

    private func route(_ request: HTTPRequest, completion: @escaping (Int, [String: Any]) -> Void) {
        if request.method == "OPTIONS" { completion(200, ["ok": true]); return }
        guard request.headers["authorization"] == "Bearer \(token)" else {
            completion(401, ["error": "Pair this phone in Eventz Settings"]); return
        }
        guard request.method == "GET" else { completion(405, ["error": "Eventz is read only"]); return }
        let path = requestPath(request.path)
        let allowed = EKEventStore.authorizationStatus(for: .event) == .fullAccess
        if path == "/v1/health" {
            completion(200, ["ok": true, "service": "Eventz", "calendars": allowed, "apiVersion": 2]); return
        }
        guard allowed else { completion(503, ["error": "Allow Calendars access in the Connector"]); return }
        DispatchQueue.main.async {
            let calendars = self.store.calendars(for: .event).sorted {
                $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
            }
            if path == "/v1/calendars" {
                completion(200, ["calendars": calendars.map { ["id": $0.calendarIdentifier, "title": $0.title, "source": $0.source.title] }]); return
            }
            guard path == "/v1/events" else { completion(404, ["error": "Not found"]); return }
            let cal = Calendar.current, today = Calendar.current.startOfDay(for: Date())
            let start = cal.date(byAdding: .day, value: -14, to: today)!
            let end = cal.date(byAdding: .month, value: 6, to: today)!
            // Legacy offsets remain available for older watch clients and settings previews.
            let offset = Int(self.queryValue(named: "offset", in: request.path) ?? "0") ?? -1
            let lower: Date, upper: Date
            if let from = self.queryValue(named: "start", in: request.path),
               let to = self.queryValue(named: "end", in: request.path) {
                guard let range = EventzQueryRange(start: from, end: to) else {
                    completion(400, ["error": "Use a valid date range of at most 32 days"]); return
                }
                lower = range.start; upper = range.end
            } else {
                guard self.queryValue(named: "start", in: request.path) == nil,
                      self.queryValue(named: "end", in: request.path) == nil,
                      (0...6).contains(offset) else { completion(400, ["error": "Invalid date range"]); return }
                lower = offset == 0 ? start : cal.date(byAdding: .month, value: offset - 1, to: today)!
                upper = cal.date(byAdding: .month, value: offset, to: today)!
            }
            let predicate = self.store.predicateForEvents(withStart: lower, end: upper, calendars: calendars)
            let dateOnly = DateFormatter()
            dateOnly.calendar = cal; dateOnly.timeZone = cal.timeZone; dateOnly.locale = Locale(identifier: "en_US_POSIX"); dateOnly.dateFormat = "yyyy-MM-dd"
            let events = self.store.events(matching: predicate).sorted { $0.startDate < $1.startDate }.map { event -> [String: Any] in
                ["id": event.eventIdentifier ?? "", "calendarID": event.calendar.calendarIdentifier,
                 "calendar": event.calendar.title, "title": event.title ?? "Untitled event",
                 "start": event.startDate.timeIntervalSince1970, "end": event.endDate.timeIntervalSince1970,
                 "allDay": event.isAllDay, "dateStart": dateOnly.string(from: event.startDate),
                 "dateLast": dateOnly.string(from: event.endDate.addingTimeInterval(-1)), "location": event.location ?? ""]
            }
            completion(200, ["events": events, "rangeStart": start.timeIntervalSince1970, "rangeEnd": end.timeIntervalSince1970,
                             "today": today.timeIntervalSince1970, "timeZone": cal.timeZone.identifier, "offset": offset,
                             "windowStart": lower.timeIntervalSince1970, "windowEnd": upper.timeIntervalSince1970])
        }
    }

    private func respond(_ connection: NWConnection, status: Int, value: [String: Any]) {
        let body = (try? JSONSerialization.data(withJSONObject: value)) ?? Data("{}".utf8)
        let reason = [200: "OK", 201: "Created", 400: "Bad Request", 401: "Unauthorized",
                      404: "Not Found", 500: "Server Error", 503: "Unavailable"][status] ?? "OK"
        let headers = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: application/json\r\n" +
            "Content-Length: \(body.count)\r\nAccess-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Headers: Authorization, Content-Type\r\n" +
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nConnection: close\r\n\r\n"
        var response = Data(headers.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    private func respondHTML(_ connection: NWConnection, status: Int, html: String) {
        let body = Data(html.utf8)
        let reason = status == 200 ? "OK" : "Gone"
        let headers = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: text/html; charset=utf-8\r\n" +
            "Content-Length: \(body.count)\r\nCache-Control: no-store\r\n" +
            "Referrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
        var response = Data(headers.utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}

final class EventzModule: NSObject, NSWindowDelegate, ObservableObject {
    @Published var requirements: [ConnectorRequirement] = [
        ConnectorRequirement("permission", "Calendars access", false, "Not checked"),
        ConnectorRequirement("service", "Mac service", false, "Not checked"),
        ConnectorRequirement("route", "Private connection", false, "Not checked")]
    @Published var busy = true
    @Published var message = "Starting service…"
    func setUpSync() {
        if EKEventStore.authorizationStatus(for: .event) != .fullAccess { requestCalendars(); return }
        if token.isEmpty { unlockToken(); return }
        if serviceStopped { startService() } else { restartService() }
    }
    func connect() {
        if EKEventStore.authorizationStatus(for: .event) != .fullAccess { requestCalendars(); return }
        if serviceStopped { startService(); return }
        if requirements.first(where: { $0.id == "route" })?.ready != true { startPrivateSync(); return }
        connectPhone()
    }
    var nextStep: String {
        if EKEventStore.authorizationStatus(for: .event) != .fullAccess { return "Continue" }
        if serviceStopped { return "Start service" }
        if requirements.first(where: { $0.id == "route" })?.ready != true { return "Start private connection" }
        return "Connect phone"
    }
    func pairPhone() { connectPhone() }
    func checkConnection() { if !busy { refresh() } }
    func repairRoute() { startPrivateSync() }
    func restart() { restartService() }
    func toggleRunning() { toggleService() }
    var isStopped: Bool { serviceStopped }

    private let store = EKEventStore()
    private var server: EventServer!
    private var window: NSWindow! { NSApp.keyWindow ?? NSApp.windows.first }
    private var calendarStatus: NSTextField!
    private var connectorStatus: NSTextField!
    private var privateStatus: NSTextField!
    private var loginStatus: NSTextField!
    private var loginButton: NSButton!
    private var summary: NSTextField!
    private var token = ""
    private var serviceBusy = true
    private var serviceStopped = false
    private var serviceButton: NSButton!
    private var restartButton: NSButton!

    func makeContent() -> NSView {
        let content = buildContent()
        unlockToken()
        return content
    }

    func unlockToken() {
        guard token.isEmpty else { return }
        serviceBusy = true
        busy = true
        message = "Unlocking the Connector token…"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let token = TokenStore.token()
            DispatchQueue.main.async {
                guard let self else { return }
                self.token = token
                if token.isEmpty {
                    self.serviceBusy = false
                    self.busy = false
                    self.message = "Keychain access is unavailable. Use Unlock Keychain in Troubleshooting and approve the macOS prompt."
                } else { self.startService() }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }

    private func startService() {
        guard !token.isEmpty else { return }
        serviceBusy = true
        updateServiceButtons()
        server = EventServer(store: store, token: token)
        server.start { [weak self] result in
            guard let self else { return }
            self.serviceBusy = false
            switch result {
            case .success:
                self.serviceStopped = false
                self.refresh()
            case .failure:
                self.serviceStopped = true
                self.refresh()
                self.setStatus(self.connectorStatus, ok: false, text: "Mac service unavailable. Check whether another service is using port 7848. Existing pairing is preserved.")
            }
        }
    }

    private func updateServiceButtons() {
        busy = serviceBusy
        serviceButton?.title = serviceStopped ? "Start Service" : "Stop Service"
        serviceButton?.isEnabled = !serviceBusy && !token.isEmpty
        restartButton?.isEnabled = !serviceBusy && !token.isEmpty
    }

    @objc private func toggleService() {
        guard !serviceBusy else { return }
        if serviceStopped { startService(); return }
        stopService(restart: false)
    }

    @objc private func restartService() {
        guard !serviceBusy else { return }
        stopService(restart: true)
    }

    private func stopService(restart: Bool) {
        serviceBusy = true
        updateServiceButtons()
        guard let server else {
            if restart { startService() }
            else { serviceBusy = false; refresh() }
            return
        }
        server.stop { [weak self] in
            guard let self else { return }
            self.server = nil
            self.serviceStopped = true
            if restart { self.startService() }
            else {
                self.serviceBusy = false
                self.refresh()
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        refresh()
        return true
    }

    private func buildContent() -> NSView {
        let content = NSView()
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 26)
        ])
        let title = NSTextField(labelWithString: "Eventz")
        title.font = .systemFont(ofSize: 26, weight: .bold)
        stack.addArrangedSubview(title)
        let intro = label("Keeps your Pebble synced with Apple Calendars anywhere through your private Tailscale network.")
        intro.textColor = .secondaryLabelColor
        stack.addArrangedSubview(intro)
        summary = label("Checking setup…")
        summary.font = .systemFont(ofSize: 18, weight: .semibold)
        stack.addArrangedSubview(summary)
        calendarStatus = statusLabel("Calendars access: Checking…")
        connectorStatus = statusLabel("Mac service: Starting…")
        privateStatus = statusLabel("Private sync: Checking Tailscale…")
        loginStatus = statusLabel("Start at login: Checking…")
        [calendarStatus, connectorStatus, privateStatus, loginStatus].forEach(stack.addArrangedSubview)
        stack.addArrangedSubview(actionRow("Continue", #selector(requestCalendars),
                                          "Lets Eventz read calendars and events. No events are changed."))
        stack.addArrangedSubview(actionRow("Start Private Sync", #selector(startPrivateSync),
                                          "Creates a tailnet-only HTTPS route. It never enables public Funnel access."))
        stack.addArrangedSubview(actionRow("Stop Private Sync", #selector(stopPrivateSync),
                                          "Removes only Eventz port 10453 and preserves other Tailscale routes."))
        stack.addArrangedSubview(actionRow("Connect Phone", #selector(connectPhone),
                                          "Shows a one-time QR code so pairing starts directly on your iPhone."))
        let loginRow = actionRow("Start at Login", #selector(toggleStartAtLogin),
                                 "Keeps remote sync available after you sign in to this Mac.")
        loginButton = loginRow.arrangedSubviews.first as? NSButton
        stack.addArrangedSubview(loginRow)
        stack.addArrangedSubview(actionRow("Test Everything", #selector(refreshAction),
                                          "Checks permission, the local service, and the Tailscale route."))
        let serviceRow = actionRow("Stop Service", #selector(toggleService),
                                   "Pauses calendar sync. Use Start Service to resume.")
        serviceButton = serviceRow.arrangedSubviews.first as? NSButton
        stack.addArrangedSubview(serviceRow)
        let restartRow = actionRow("Restart Service", #selector(restartService),
                                   "Restarts sync using your existing pairing and permissions.")
        restartButton = restartRow.arrangedSubviews.first as? NSButton
        stack.addArrangedSubview(restartRow)
        updateServiceButtons()
        stack.addArrangedSubview(label("Closing this window keeps sync running. Reopen Organik Apps Pebble Connector from Applications to manage the service."))
        let footer = label("Reminder titles travel only between your Apple devices and your private tailnet. The access token is stored in macOS Keychain. Connector \(connectorVersion).")
        footer.font = .systemFont(ofSize: 12)
        footer.textColor = .secondaryLabelColor
        stack.addArrangedSubview(footer)
        stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24).isActive = true
        return scrollingDocument(content)
    }

    var overviewStatus: String { summary?.stringValue ?? "Not checked" }
    func stopModule() { stopService(restart: false) }

    private func label(_ text: String) -> NSTextField {
        let value = NSTextField(wrappingLabelWithString: text)
        value.maximumNumberOfLines = 0
        value.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return value
    }

    private func statusLabel(_ text: String) -> NSTextField {
        let value = label("○  \(text)")
        value.font = .systemFont(ofSize: 16, weight: .medium)
        return value
    }

    private func actionRow(_ title: String, _ action: Selector, _ explanation: String) -> NSStackView {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        button.widthAnchor.constraint(equalToConstant: 175).isActive = true
        let detail = label(explanation)
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = .secondaryLabelColor
        let row = NSStackView(views: [button, detail])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 14
        return row
    }

    private func setStatus(_ field: NSTextField?, ok: Bool, text: String) {
        field?.stringValue = "\(ok ? "●" : "⚠")  \(text)"
        field?.textColor = ok ? .systemGreen : .systemOrange
    }

    @objc private func requestCalendars() {
        store.requestFullAccessToEvents { [weak self] granted, error in
            DispatchQueue.main.async {
                guard let self else { return }
                self.refresh()
                if !granted {
                    let detail = error?.localizedDescription ??
                        "Open System Settings → Privacy & Security → Calendars and allow Organik Apps Pebble Connector."
                    self.showAlert("Calendars access was not granted", detail)
                }
            }
        }
    }

    @objc private func startPrivateSync() {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                _ = try PrivateConnection.start(target: "http://127.0.0.1:7848", port: 10453)
                DispatchQueue.main.async { self.refresh() }
            } catch {
                DispatchQueue.main.async { self.showAlert("Private sync needs attention", error.localizedDescription) }
            }
        }
    }

    @objc private func stopPrivateSync() {
        guard let origin = Self.privateOrigin(), let url = URL(string: origin) else { return }
        let activePort = String(url.port ?? 443)
        let alert = NSAlert()
        alert.messageText = "Stop private Eventz sync?"
        alert.informativeText = "This removes only the Eventz HTTPS route on port \(activePort). Other Tailscale Serve routes stay unchanged."
        alert.addButton(withTitle: "Stop Sync")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let result = Self.runTailscale(["serve", "--yes", "--https=\(activePort)", "off"])
        if result.status != 0 { showAlert("Tailscale could not stop private sync", result.output) }
        refresh()
    }

    @objc private func toggleStartAtLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            showAlert("Start at Login could not change", error.localizedDescription)
        }
        refresh()
        if SMAppService.mainApp.status == .requiresApproval {
            showAlert("Approve Eventz in Login Items",
                      "Open System Settings → General → Login Items, then allow Organik Apps Pebble Connector.")
        }
    }

    @objc private func connectPhone() {
        guard !serviceStopped && !serviceBusy else {
            showAlert("Start the service first", "Choose Start Service, then connect your phone.")
            return
        }
        guard !token.isEmpty else {
            showAlert("Connector token is still locked", "Approve the macOS Keychain prompt, then try again.")
            return
        }
        guard let origin = Self.privateOrigin() else {
            showAlert("Private sync is not ready", "Choose Start Private Sync first, then make sure Tailscale is connected.")
            return
        }
        guard let pairingURL = server?.makePairingURL(origin: origin),
              let qrImage = Self.qrImage(for: pairingURL.absoluteString) else {
            showAlert("Could not create a pairing code", "Choose Connect Phone again.")
            return
        }
        let payload = ["gatewayURL": origin, "gatewayToken": token]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        showPairingAlert(qrImage: qrImage)
    }

    @objc private func refreshAction() { refresh() }

    private var checking = false
    private func refresh() {
        guard !checking else { return }
        checking = true
        let allowed = EKEventStore.authorizationStatus(for: .event) == .fullAccess
        let canRun = !serviceStopped && !serviceBusy && !token.isEmpty
        let token = token
        DispatchQueue.global(qos: .utility).async {
            let local = canRun && Self.localHealth(token: token)
            let origin = Self.privateOrigin()
            let privateResult = origin.map { Self.healthResult(token: token, origin: $0) } ?? (ready: false, detail: "No private route is configured for Eventz.")
            let privateOK = privateResult.ready
            DispatchQueue.main.async {
                self.checking = false
                guard !self.serviceBusy, canRun == (!self.serviceStopped && !self.token.isEmpty) else { return }
                self.requirements = [
                    ConnectorRequirement("permission", "Calendars access", allowed, allowed ? "Calendars access allowed." : "Allow Calendars access in System Settings → Privacy & Security → Calendars."),
                    ConnectorRequirement("service", "Mac service", local, local ? "Service running." : "Start the service. Check whether another service is using port 7848."),
                    ConnectorRequirement("route", "Private connection", privateOK, privateResult.detail)]
                self.updateServiceButtons()
                self.message = allowed && local && privateOK ? "Ready to connect your phone." : "Complete the requirements above."
                self.summary.stringValue = self.message
            }
        }
    }

    private func showAlert(_ title: String, _ message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.runModal()
    }

    private func showPairingAlert(qrImage: NSImage) {
        let imageView = NSImageView(frame: NSRect(x: 0, y: 0, width: 248, height: 248))
        imageView.image = qrImage
        imageView.imageScaling = .scaleProportionallyUpOrDown
        let alert = NSAlert()
        alert.messageText = "Scan with your iPhone"
        alert.informativeText = "Open Camera and scan this one-time code within 10 minutes. On the page, copy the pairing details, then paste them into Pebble → Eventz → Settings.\n\nA Mac-only clipboard copy is also available as a backup."
        alert.accessoryView = imageView
        alert.addButton(withTitle: "Done")
        alert.runModal()
    }

    private static func qrImage(for value: String) -> NSImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(value.utf8), forKey: "inputMessage")
        filter.setValue("Q", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)) else {
            return nil
        }
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let cgImage = context.createCGImage(output, from: output.extent) else { return nil }
        return NSImage(cgImage: cgImage, size: NSSize(width: 248, height: 248))
    }

    private static func tailscalePath() -> String? {
        ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale",
         "/usr/local/bin/tailscale"].first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    private static func runTailscale(_ arguments: [String]) -> (status: Int32, output: String) {
        guard let executable = tailscalePath() else { return (-1, "Install and sign in to Tailscale first.") }
        let process = Process(), pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError = pipe
        var environment = ProcessInfo.processInfo.environment
        if environment["TERM"] == nil { environment["TERM"] = "dumb" }
        process.environment = environment
        do { try process.run(); process.waitUntilExit() } catch { return (-1, error.localizedDescription) }
        let output = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        return (process.terminationStatus, output.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private static func privateOrigin() -> String? {
        guard let configuration = try? PrivateConnection.configuration() else { return nil }
        return PrivateConnection.origin(target: "http://127.0.0.1:7848", configuration: configuration)
    }

    private static func localHealth(token: String) -> Bool {
        healthResult(token: token, origin: "http://127.0.0.1:7848").ready
    }
    private static func healthResult(token: String, origin: String) -> (ready: Bool, detail: String) {
        guard let url = URL(string: origin+"/v1/health") else { return (false, "Invalid service address.") }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let semaphore = DispatchSemaphore(value: 0), lock = NSLock()
        var result = (ready: false, detail: "The Mac check timed out. Try Check connection again.")
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            lock.lock(); defer { lock.unlock() }
            if let error = error as NSError? {
                result = (false, "The Mac check failed (\(error.domain), \(error.code)). Try Check connection again.")
            } else if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                result = (false, "The service returned HTTP \(http.statusCode).")
            } else if let data, let health = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      health["ok"] as? Bool == true && health["service"] as? String == "Eventz" && health["apiVersion"] as? Int == 2 {
                result = (true, "Private route reached Eventz from this Mac.")
            } else { result = (false, "The route did not return Eventz health data.") }
        }
        task.resume()
        if semaphore.wait(timeout: .now() + 9) == .timedOut { task.cancel() }
        lock.lock(); defer { lock.unlock() }
        return result
    }

}

private enum TokenStore {
    private static let service = "org.eventz.connector.credentials"
    private static let account = "gateway-token"

    static func token() -> String {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account,
                                    kSecReturnData as String: true]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess,
           let data = item as? Data, let value = String(data: data, encoding: .utf8) { return value }
        guard status == errSecItemNotFound else { return "" }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return "" }
        let value = Data(bytes).base64EncodedString()
        let add: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                  kSecAttrService as String: service,
                                  kSecAttrAccount as String: account,
                                  kSecValueData as String: Data(value.utf8)]
        guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { return "" }
        return value
    }
}
