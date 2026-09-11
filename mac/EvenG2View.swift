import SwiftUI

struct ConnectorWindow: View {
    @ObservedObject var model: ConnectorModel
    @AppStorage("connector.platform") private var platform = "pebble"
    var body: some View {
        TabView(selection:$platform) {
            PebbleConnectorWindow(model:model).tabItem {Label("Pebble",systemImage:"applewatch")}.tag("pebble")
            EvenG2View(service:model.even,home:model.cameras).tabItem {Label("Even G2",systemImage:"eyeglasses")}.tag("even")
        }.frame(minWidth:820,minHeight:660)
    }
}
struct EvenG2View: View {
    @ObservedObject var service: EvenG2Service
    @ObservedObject var home: PomeCameraService
    var body: some View {
        ScrollView {
            VStack(alignment:.leading,spacing:22) {
                Label("Pome for Even G2",systemImage:"eyeglasses").font(.largeTitle.weight(.semibold))
                Text("Your home, through the same Connector as Pebble. Favorites, rooms, devices and green camera snapshots on your glasses.").foregroundStyle(.secondary)
                RequirementList(requirements:home.homeRequirements.filter {$0.id != "route"})
                RequirementLight(requirement:ConnectorRequirement("g2-service", "G2 service", service.running, "Start the G2 connection."))
                RequirementLight(requirement:ConnectorRequirement("g2-route", "G2 private connection", !service.origin.isEmpty, "Connect Tailscale on your Mac and phone."))
                SetupStep(number:1,title:"Connect Apple Home",detail:"Pome shares the existing HomeKit connection. Your Pebble setup and home permissions are retained.") {
                    Button("Connect Apple Home") {home.setUpHome()}.disabled(home.busy)
                }
                SetupStep(number:2,title:"Connect Even G2",detail:"Keep Tailscale connected on this Mac and your phone. Start the G2 connection, then paste the pairing details into Pome’s settings in the Even phone app.") {
                    HStack {
                        Button(service.running ? "Restart G2 connection" : "Start G2 connection") {service.start(home:home)}.buttonStyle(.borderedProminent)
                        Button("Copy pairing") {service.copyPairing()}.disabled(!service.running || service.origin.isEmpty)
                        if service.running {Button("Stop") {service.disconnect()}}
                    }.disabled(service.busy)
                    if !service.origin.isEmpty {Text(service.origin).font(.caption).textSelection(.enabled)}
                    Text(service.message).font(.callout).foregroundStyle(.secondary)
                }
                GroupBox("Dictation") {
                    VStack(alignment:.leading,spacing:12) {
                        Text("Free local Parakeet dictation is prepared automatically when you start the G2 connection. It runs privately on your Apple Silicon Mac with no API key or usage charges.").foregroundStyle(.secondary)
                        DisclosureGroup("Advanced · custom speech provider") {
                            Toggle("Use a custom provider",isOn:Binding(get:{!service.useLocalSpeech},set:{service.useLocalSpeech = !$0})).disabled(service.busy)
                            if !service.useLocalSpeech {
                                Text("Recordings go to the endpoint below. Credentials stay on this Mac.").foregroundStyle(.secondary)
                                TextField("API base URL (ending in /v1)",text:$service.speechURL)
                                TextField("Model",text:$service.speechModel)
                                SecureField("API key (leave blank to retain saved key)",text:$service.speechKey)
                            }
                            Button("Apply dictation settings") {service.start(home:home)}.disabled(service.busy)
                        }
                        if service.busy {ProgressView().controlSize(.small)}
                        Text(service.dictationReady ? "Dictation ready. Test a recording on your glasses." : "Finish setup to enable dictation.").font(.caption).foregroundStyle(.secondary)
                    }.padding(10)
                }
                Text("Favorites, room order, gestures, image contrast and language are set in Pome’s Even phone settings. Camera capture availability is shared with Pebble; enable cameras in Pome’s existing setup if needed.").font(.callout).foregroundStyle(.secondary)
            }.padding(28).frame(maxWidth:850).frame(maxWidth:.infinity,alignment:.leading)
        }
    }
}
