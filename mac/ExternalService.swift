import AppKit
import SwiftUI

@MainActor final class ExternalService: ObservableObject {
    let name: String
    let description: String
    let healthPath: String
    @Published var localHost: String { didSet { if localHost != oldValue { invalidateEndpoint() } } }
    @Published var localPort: String { didSet { if localPort != oldValue { invalidateEndpoint() } } }
    @Published var privatePort: String
    @Published var status = "Not checked"
    @Published var origin = ""
    @Published var busy = false
    private var checking = false
    private var checkPending = false
    private var checkRevision = 0
    @Published var localReady = false
    @Published var privateReady = false
    @Published var privateCheckDetail = "Not checked"
    init(name: String, description: String, localPort: Int, privatePort: Int, healthPath: String) {
        self.name=name;self.description=description;self.healthPath=healthPath
        self.localHost=UserDefaults.standard.string(forKey:name+".localHost") ?? "127.0.0.1"
        self.localPort=UserDefaults.standard.string(forKey:name+".localPort") ?? String(localPort)
        self.privatePort=UserDefaults.standard.string(forKey:name+".privatePort") ?? String(privatePort)
    }
    private func invalidateEndpoint() { checkRevision += 1; localReady=false;privateReady=false;origin="";status="Save and check the new service address." }
    var target: String { "http://\(localHost):\(localPort)" }
    func save() throws {
        localHost=localHost.trimmingCharacters(in:.whitespacesAndNewlines)
        guard !localHost.isEmpty, localHost.range(of:"^[A-Za-z0-9.-]+$",options:.regularExpression) != nil else {throw ConnectorError(message:"Enter a hostname or IPv4 address without a scheme, port, or path.")}
        UserDefaults.standard.set(localHost,forKey:name+".localHost")
        guard let port=Int(localPort),(1024...65535).contains(port),let remote=Int(privatePort),(1024...65535).contains(remote) else {throw ConnectorError(message:"Enter port numbers between 1024 and 65535.")}
        UserDefaults.standard.set(localPort,forKey:name+".localPort");UserDefaults.standard.set(privatePort,forKey:name+".privatePort")
    }
    func saveAndCheck() async {
        do { try save() } catch { status = error.localizedDescription; return }
        checkRevision += 1
        if checking { checkPending = true; return }
        await check()
    }
    func check() async {
        guard !busy, !checking else{return};checking=true
        defer {
            checking=false
            if checkPending { checkPending=false; Task { await self.check() } }
        }
        let revision=checkRevision
        do {
            guard let url=URL(string:target+healthPath) else{return}
            let response=try await jsonRequest(url)
            if name=="Tesla",response["mode"] as? String != "tesla" {throw ConnectorError(message:"This port is not a live Tesla gateway.")}
            guard revision == checkRevision, !busy else { return }
            localReady=true
            status="Mac service reachable."
        }catch{guard revision == checkRevision, !busy else { return };localReady=false;status=error.localizedDescription}
        let config=await Task.detached {try? PrivateConnection.configuration()}.value
        guard revision == checkRevision, !busy else { return }
        origin=config.flatMap{PrivateConnection.origin(target:target,configuration:$0)} ?? ""
        let ready = await verifyPrivateRoute()
        guard revision == checkRevision, !busy else { return }
        privateReady = ready
    }
    func privateConnection() {
        guard !busy else{return};busy=true;checkRevision += 1
        Task {
            defer{busy=false}
            do {try save();let target=target,port=Int(privatePort)!
                origin=try await Task.detached{try PrivateConnection.start(target:target,port:port)}.value
                privateReady = await verifyPrivateRoute()
                status=privateReady ? "Private connection ready. Copy its address into \(name)’s phone settings." : "The route is configured but unreachable. Check Tailscale and the service, then try again."
            }catch{status=error.localizedDescription}
        }
    }
    private func verifyPrivateRoute() async -> Bool {
        let revision = checkRevision
        guard !origin.isEmpty, let url=URL(string:origin+healthPath) else {
            privateCheckDetail = "No private route is configured for this service."
            return false
        }
        do {
            let response = try await jsonRequest(url)
            guard revision == checkRevision else { return false }
            let ready = name != "Tesla" || response["mode"] as? String == "tesla"
            privateCheckDetail = ready ? "Private route reached the service from this Mac." : "The route returned a different service."
            return ready
        } catch {
            guard revision == checkRevision else { return false }
            let error = error as NSError
            privateCheckDetail = "The Mac check failed (\(error.domain), \(error.code)). Try Check connection again."
            return false
        }
    }
    var requirements: [ConnectorRequirement] {
        [ConnectorRequirement("service", "Mac service", localReady, status),
         ConnectorRequirement("route", "Private connection", privateReady, privateCheckDetail)]
    }
}
