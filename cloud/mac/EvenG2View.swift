import SwiftUI

struct ConnectorWindow: View {
    @ObservedObject var model: ConnectorModel
    @AppStorage("connector.platform") private var platform = "pebble"
    var body: some View {
        TabView(selection:$platform) {
            PebbleConnectorWindow(model:model).tabItem {Label("Pebble",systemImage:"applewatch")}.tag("pebble")
            EvenG2View(service:model.even,home:model.cameras,model:model).tabItem {Label("Even G2",systemImage:"eyeglasses")}.tag("even")
        }.frame(minWidth:820,minHeight:660)
    }
}
struct EvenG2View: View {
    @ObservedObject var service: EvenG2Service
    @ObservedObject var home: PomeCameraService
    @ObservedObject var model: ConnectorModel
    @State private var app = "pome"
    var body: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:22) {
                Label("Organik Apps for Even G2",systemImage:"eyeglasses").font(.largeTitle.weight(.semibold))
                Picker("G2 app",selection:$app) {Text("Pome").tag("pome");Text("Beepster").tag("beepster");Text("DayFrame").tag("dayframe")}.pickerStyle(.segmented)
                if app == "beepster" {
                    Text("Conversations, quick replies, Parakeet dictation, GIF frames and green attachment previews. Uses your existing Beepster connection.").foregroundStyle(.secondary)
                    RequirementLight(requirement:ConnectorRequirement("g2-beepster", "Beeper conversations", service.beepsterReady, "Enable Beepster and restart the G2 connection."))
                    if let module = model.beepster { BeepsterView(module:module,isEvenG2:true) }
                    else { Button("Enable Beepster") {model.enable(.beepster)} }
                } else if app == "dayframe" {
                    Text("Your Mac calendars in sight. Choose visible calendars, combine a custom list, reorder calendars and show event countdowns in DayFrame’s phone settings.").foregroundStyle(.secondary)
                    RequirementLight(requirement:ConnectorRequirement("g2-dayframe", "DayFrame calendars", service.dayframeReady, "Enable Calendars access, then restart the G2 connection."))
                    if let module = model.eventz {
                        RequirementList(requirements:module.requirements.filter {$0.id != "route"})
                        Button("Set up Calendars") {module.setUpSync()}.disabled(module.busy)
                        Text(module.message).font(.callout).foregroundStyle(.secondary)
                    } else {Button("Enable Calendars") {model.enable(.eventz)}}
                } else {
                RequirementList(requirements:home.homeRequirements.filter {$0.id != "route"})
                RequirementLight(requirement:ConnectorRequirement("g2-service", "G2 service", service.running, "Start the G2 connection."))
                RequirementLight(requirement:ConnectorRequirement("g2-route", "G2 private connection", !service.origin.isEmpty, "Connect Tailscale on your Mac and phone."))
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
                        Text("Local Parakeet dictation is optional. Setup downloads about 500 MB of public model files from Hugging Face and needs at least 1 GB free disk space. Existing cached files are reused. Speech runs on this Apple Silicon Mac without uploading recordings or usage charges.").foregroundStyle(.secondary)
                        Button("Set up local dictation…") {service.setUpLocalDictation(home:home,beepster:model.beepster,eventz:model.eventz,connectHome:app == "pome")}.disabled(service.busy)
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
                Text("App preferences are in each app’s Even phone settings. Beepster also has a glasses Settings menu for reading and media options. Pome camera availability remains shared with Pebble.").font(.callout).foregroundStyle(.secondary)
            }.padding(28).frame(maxWidth:850).frame(maxWidth:.infinity,alignment:.leading)
        }
    }
}
