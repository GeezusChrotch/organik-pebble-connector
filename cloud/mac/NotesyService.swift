import AppKit
import SwiftUI
import CoreImage

@MainActor final class NotesyService: ObservableObject {
    @Published var vault: URL?
    private var notesFolder = UserDefaults.standard.string(forKey:"stone.notesFolder") ?? "Pebble"
    @Published var running = false
    @Published var busy = false
    @Published var status = "Choose your Obsidian vault to get started."
    @Published var origin = ""
    @Published var privateReady = false
    @Published var lastPhone = "No phone contact yet"
    @Published var vaultReady = false
    @Published var privateCheckDetail = "Not checked"
    private var process: Process?
    private var token = ""
    private var accessing = false
    private var intentionallyStopped = false
    @Published private var completedInitialCheck = false
    let support = FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("Organik Apps Pebble Connector/StoneNotes")
    init() {
        if let data = UserDefaults.standard.data(forKey:"stone.vault") {
            var stale=false
#if APP_STORE
            if let url=try? URL(resolvingBookmarkData:data,options:[.withSecurityScope, .withoutUI],relativeTo:nil,bookmarkDataIsStale:&stale) { vault=url }
#else
            if let url=try? URL(resolvingBookmarkData:data,options:.withoutUI,relativeTo:nil,bookmarkDataIsStale:&stale) {vault=url}
#endif
        }
    }
    var requirements: [ConnectorRequirement] {
        [ConnectorRequirement("vault", "Obsidian vault", vaultReady, vault?.path ?? "Choose your Obsidian vault folder."),
         ConnectorRequirement("service", "Mac service", running && vaultReady, status),
         ConnectorRequirement("route", "Private connection", privateReady, privateCheckDetail)]
            .map { $0.pending(vault != nil && !completedInitialCheck) }
    }
    var nextStep: String {
        if vault == nil { return "Choose vault…" }
        if !running { return "Start service" }
        if !privateReady { return "Start private connection" }
        return "Connect phone"
    }
    func connectNextStep() {
        if vault == nil { chooseVault() }
        else if !running { start() }
        else if !privateReady { startPrivate() }
        else { connectPhone() }
    }
    func chooseVault() {
        let panel=NSOpenPanel();panel.canChooseFiles=false;panel.canChooseDirectories=true;panel.allowsMultipleSelection=false
        panel.message="Choose your Obsidian vault. Browse its folders and Markdown notes from your watch."
        panel.prompt="Use this vault"; panel.directoryURL=vault
        guard panel.runModal() == .OK, let url=panel.url else{return}
        do {
#if APP_STORE
            let data=try url.bookmarkData(options:.withSecurityScope,includingResourceValuesForKeys:nil,relativeTo:nil)
#else
            let data=try url.bookmarkData(options:.minimalBookmark,includingResourceValuesForKeys:nil,relativeTo:nil)
#endif
            stop();vault=url;notesFolder="Pebble";UserDefaults.standard.set(notesFolder,forKey:"stone.notesFolder");UserDefaults.standard.set(data,forKey:"stone.vault")
            status="Ready to browse \(url.lastPathComponent)."
        } catch {status=error.localizedDescription}
    }
    func start() {
        guard !busy,!running,let vault else{return}
        busy=true;intentionallyStopped=false;status="Starting Notesy…"
        Task {
            do {
                let newToken = try await Task.detached {try ConnectorSecrets.token()}.value
                token=newToken
                accessing=vault.startAccessingSecurityScopedResource()
                try FileManager.default.createDirectory(at:support,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
                let config: [String:Any] = ["vault":vault.path,"folder":notesFolder,"state":support.path,"port":7844]
                let file=support.appendingPathComponent("config.json")
                try JSONSerialization.data(withJSONObject:config).write(to:file,options:.atomic)
                try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path)
                let child=Process();child.executableURL=try bundledNode()
                guard let server=Bundle.main.resourceURL?.appendingPathComponent("Notesy/server.js") else{throw ConnectorError(message:"Notesy is missing from this app.")}
                child.arguments=[server.path,file.path]
                var env=ProcessInfo.processInfo.environment;env["STONENOTES_TOKEN"]=token;child.environment=env
                child.standardInput=FileHandle.nullDevice;child.standardOutput=FileHandle.nullDevice;child.standardError=FileHandle.nullDevice
                child.terminationHandler={ [weak self] child in Task { @MainActor in
                    guard let self,self.process===child else{return}
                    self.running=false;self.privateReady=false;self.vaultReady=false;self.busy=false
                    if !self.intentionallyStopped {self.status="Notesy stopped. Check the vault and whether port 7844 is already in use, then start again."}
                }}
                try child.run();process=child
                for _ in 0..<20 {
                    try await Task.sleep(nanoseconds:150_000_000)
                    if !child.isRunning {throw ConnectorError(message:"Notesy could not start. Check the selected vault and whether another service uses port 7844.")}
                    if let result=try? await jsonRequest(URL(string:"http://127.0.0.1:7844/v1/health")!,token:token),result["service"] as? String == "StoneNotes" {
                        running=true;vaultReady=true;busy=false;status="Ready · browsing \(vault.lastPathComponent)"
                        UserDefaults.standard.set(true,forKey:"stone.enabled");await refresh();return
                    }
                }
                throw ConnectorError(message:"Notesy did not become ready. Check the selected vault, then try again.")
            } catch {stop();status=error.localizedDescription;busy=false}
        }
    }
    func stop() {
        intentionallyStopped=true
        if let child=process,child.isRunning {child.terminate();child.waitUntilExit()}
        process=nil;privateReady=false;running=false;vaultReady=false;busy=false;lastPhone="No phone contact yet"
        if accessing {vault?.stopAccessingSecurityScopedResource();accessing=false}
        UserDefaults.standard.set(false,forKey:"stone.enabled");status="Notesy is stopped. Your notes and pairing are preserved."
    }
    func shutdown() {intentionallyStopped=true;process?.terminate()}
    func refresh() async {
        guard !busy else { return }
        defer { completedInitialCheck = true }
        if running {
            do {
                let result=try await jsonRequest(URL(string:"http://127.0.0.1:7844/v1/health")!,token:token)
                guard result["service"] as? String == "StoneNotes" else { throw ConnectorError(message:"Another service is using the Notesy port.") }
                vaultReady=true
                status="Notesy is running."
                if result["lastPhoneContact"] as? String == nil { lastPhone="No phone contact since the service started. Open Notesy on your watch to test." }
                if let text=result["lastPhoneContact"] as? String,let date=ISO8601DateFormatter().date(from:text) {lastPhone="Last contact: "+RelativeDateTimeFormatter().localizedString(for:date,relativeTo:Date())}
            }catch{vaultReady=false;status="The vault is unavailable. Check its location and permissions."}
        }
        let result=await Task.detached {try? PrivateConnection.configuration()}.value
        origin=result.flatMap{PrivateConnection.origin(target:"http://127.0.0.1:7844",configuration:$0)} ?? ""
        // Keep the previous result while a new request is in flight. Refreshing is not failure.
        var ready = false
        var detail = "Start the service and private connection."
        if running, !token.isEmpty, !origin.isEmpty, let url=URL(string:origin+"/v1/health") {
            do {
                let health = try await jsonRequest(url,token:token)
                ready = health["service"] as? String == "StoneNotes"
                detail = ready ? "Private route reached Notesy from this Mac." : "The route returned a different service."
            } catch {
                let error = error as NSError
                detail = "The Mac check failed (\(error.domain), \(error.code)). Try Check connection again."
            }
        }
        privateCheckDetail = detail
        privateReady = ready
    }
    func startPrivate() {
        guard running,!busy else{return};busy=true
        Task {
            do {
                origin=try await Task.detached {try PrivateConnection.start(target:"http://127.0.0.1:7844",port:10448)}.value
                await refresh()
                status=privateReady ? "Private connection ready. Connect your phone next." : "The route is configured but unreachable. Check Tailscale and try Check connection."
            }
            catch{status=error.localizedDescription}
            busy=false
        }
    }
    func connectPhone() {
        guard running,!origin.isEmpty,!busy else{return};busy=true
        Task {
            defer{busy=false}
            do {
                let result=try await jsonRequest(URL(string:"http://127.0.0.1:7844/v1/pairing")!,token:token,body:["origin":origin])
                guard let link=result["url"] as? String,let filter=CIFilter(name:"CIQRCodeGenerator") else{throw ConnectorError(message:"Could not create the pairing code.")}
                filter.setValue(Data(link.utf8),forKey:"inputMessage");filter.setValue("M",forKey:"inputCorrectionLevel")
                guard let output=filter.outputImage?.transformed(by:CGAffineTransform(scaleX:8,y:8)),let cg=CIContext().createCGImage(output,from:output.extent) else{return}
                let image=NSImageView(frame:NSRect(x:0,y:0,width:250,height:250));image.image=NSImage(cgImage:cg,size:NSSize(width:250,height:250));image.imageScaling = .scaleProportionallyUpOrDown
                let alert=NSAlert();alert.messageText="Connect Notesy on your phone"
                alert.informativeText="Scan with your phone’s Camera. Tap Get pairing details, then copy them into Pebble → Notesy → Settings. Test and save.\n\nThis code expires in 10 minutes and works once."
                alert.accessoryView=image;alert.addButton(withTitle:"Done");alert.addButton(withTitle:"Copy pairing link")
                if alert.runModal() == .alertSecondButtonReturn {NSPasteboard.general.clearContents();NSPasteboard.general.setString(link,forType:.string)}
            }catch{status=error.localizedDescription}
        }
    }
}
