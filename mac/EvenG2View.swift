import SwiftUI

struct ConnectorWindow: View {
    @ObservedObject var model: ConnectorModel
    @AppStorage("connector.platform") private var platform = "pebble"
    var body: some View {
        TabView(selection:$platform) {
            PebbleConnectorWindow(model:model).tabItem {Label("Pebble",systemImage:"applewatch")}.tag("pebble")
            EvenG2View(service:model.even,home:model.cameras,model:model).tabItem {Label("Even G2",systemImage:"eyeglasses")}.tag("even")
        }.frame(minWidth:820,minHeight:660)
        .environmentObject(model)
        .sheet(isPresented: Binding(get: { model.repairPanel != nil }, set: { if !$0 { model.repairPanel = nil } })) {
            VStack(alignment: .leading, spacing: 16) {
                HStack { Text("Resolve connection issue").font(.title2); Spacer(); Button("Done") { model.repairPanel = nil } }
                ScrollView {
                    if let panel = model.repairPanel, panel.hasPrefix("agent-"), let module = model.beepster {
                        AgentSetupView(module: module, provider: String(panel.dropFirst(6)))
                    } else if model.repairPanel == "cameras" { PomeCameraSetup(service: model.cameras) }
                    else if model.repairPanel == "tesla" { ExternalServiceView(startWithSetup: true, page: .tesla, service: model.tesla) }
                }
            }.padding(24).frame(width: 700, height: 560).environmentObject(model)
        }
    }
}
struct EvenG2View: View {
    @ObservedObject var service: EvenG2Service
    @ObservedObject var home: PomeCameraService
    @ObservedObject var model: ConnectorModel
    private func startG2() { service.start(home: home, beepster: model.beepster, eventz: model.eventz, connectHome: app == "pome", prepareDictation: service.dictationReady) }
    @State private var app = ConnectorDistribution.pomeAvailable ? "pome" : "beepster"
    var body: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:22) {
                Label("Organik Apps for Even G2",systemImage:"eyeglasses").font(.largeTitle.weight(.semibold))
                Picker("G2 app",selection:$app) {Text("Pome").tag("pome");Text("Beepster").tag("beepster");Text("DayFrame").tag("dayframe")}.pickerStyle(.segmented)
                if app == "pome" && !ConnectorDistribution.pomeAvailable { PomeComingSoonView() }
                else {
                if app == "beepster" {
                    Text("Conversations, quick replies, Parakeet dictation, GIF frames and green attachment previews. Uses your existing Beepster connection.").foregroundStyle(.secondary)
                    RequirementRow(requirement:ConnectorRequirement("g2-beepster", "Beeper conversations", service.beepsterReady, "Connect Beeper, then start the G2 connection.")) { model.enable(.beepster); if model.beepster?.requirements.first(where: { $0.id == "beeper" })?.ready == true { startG2() } else { model.beepster?.connect() } }
                    if let module = model.beepster { BeepsterView(module:module,isEvenG2:true) }
                    else { Button("Enable Beepster") {model.enable(.beepster)} }
                } else if app == "dayframe" {
                    Text("Your Mac calendars in sight. Choose visible calendars, combine a custom list, reorder calendars and show event countdowns in DayFrame’s phone settings.").foregroundStyle(.secondary)
                    RequirementRow(requirement:ConnectorRequirement("g2-dayframe", "DayFrame calendars", service.dayframeReady, "Allow Calendars access, then start the G2 connection.")) { model.enable(.eventz); if model.eventz?.requirements.first(where: { $0.id == "permission" })?.ready == true { startG2() } else { model.fix(.eventz, "permission") } }
                    if let module = model.eventz {
                        RequirementList(page: .eventz, requirements:module.requirements.filter {$0.id != "route"})
                        Button("Set up Calendars") {module.setUpSync()}.disabled(module.busy)
                        Text(module.message).font(.callout).foregroundStyle(.secondary)
                    } else {Button("Enable Calendars") {model.enable(.eventz)}}
                } else {
                RequirementList(requirements:home.homeRequirements.filter {$0.id != "route"})
                RequirementRow(requirement:ConnectorRequirement("g2-service", "G2 service", service.running, "Start the G2 connection.")) { startG2() }
                RequirementRow(requirement:ConnectorRequirement("g2-route", "G2 private connection", !service.origin.isEmpty, "Connect Tailscale on your Mac and phone.")) { if model.tailscale.ready { startG2() } else { model.fixTailscale() } }
                SetupStep(number:1,title:"Connect Apple Home",detail:"Pome shares the existing HomeKit connection. Your Pebble setup and home permissions are retained.") {
                    Button("Connect Apple Home") {home.setUpHome()}.disabled(home.busy)
                }
                }
                SetupStep(number:2,title:"Connect Even G2",detail:"Keep Tailscale connected on this Mac and your phone. Start the G2 connection, then paste the pairing details into your G2 app’s settings in the Even phone app.") {
                    HStack {
                        Button(service.running ? "Restart G2 connection" : "Start G2 connection") {service.start(home:home,beepster:model.beepster,eventz:model.eventz,connectHome:app == "pome",prepareDictation:service.dictationReady)}.buttonStyle(.borderedProminent)
                        Button("Copy pairing") {service.copyPairing()}.disabled(!service.running || service.origin.isEmpty)
                        if service.running {Button("Stop") {service.disconnect()}}
                    }.disabled(service.busy)
                    if !service.origin.isEmpty {Text(service.origin).font(.caption).textSelection(.enabled)}
                    Text(service.message).font(.callout).foregroundStyle(.secondary)
                }
                if app != "dayframe" { GroupBox("Dictation") {
                    VStack(alignment:.leading,spacing:12) {
                        Text("Local Parakeet dictation is optional. Setup downloads about 500 MB from Hugging Face and needs at least 1 GB free disk space. Existing cached models are reused. Transcription runs on your Apple Silicon Mac with no API key or usage charges.").foregroundStyle(.secondary)
                        Button("Set up local dictation…") {service.useLocalSpeech = true; service.start(home:home,beepster:model.beepster,eventz:model.eventz,connectHome:false,prepareDictation:true)}.disabled(service.busy)
                        DisclosureGroup("Advanced · custom speech provider") {
                            Toggle("Use a custom provider",isOn:Binding(get:{!service.useLocalSpeech},set:{service.useLocalSpeech = !$0})).disabled(service.busy)
                            if !service.useLocalSpeech {
                                Text("Recordings go to the endpoint below. Credentials stay on this Mac.").foregroundStyle(.secondary)
                                TextField("API base URL (ending in /v1)",text:$service.speechURL)
                                TextField("Model",text:$service.speechModel)
                                SecureField("API key (leave blank to retain saved key)",text:$service.speechKey)
                            }
                            Button("Apply dictation settings") {service.start(home:home,beepster:model.beepster,eventz:model.eventz,connectHome:app == "pome",prepareDictation:app != "dayframe" || service.dictationReady)}.disabled(service.busy)
                        }
                        if service.busy {ProgressView().controlSize(.small)}
                        Text(service.dictationReady ? "Dictation ready. Test a recording on your glasses." : "Finish setup to enable dictation.").font(.caption).foregroundStyle(.secondary)
                    }.padding(10)
                }
                }
                Text("App preferences are in each app’s Even phone settings. Beepster also has a glasses Settings menu for reading and media options. \(ConnectorDistribution.pomeAvailable ? "Pome uses Apple Home through this edition." : ConnectorDistribution.pomeNotice)").font(.callout).foregroundStyle(.secondary)
                }
            }.padding(28).frame(maxWidth:850).frame(maxWidth:.infinity,alignment:.leading)
        }
    }
}
