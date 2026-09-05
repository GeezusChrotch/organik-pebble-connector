import SwiftUI

struct AgentChoice: Decodable, Identifiable {
    let provider: String
    let sessionKey: String
    let label: String?
    var id: String { provider + "|" + sessionKey }
}
struct AgentChat: Decodable, Identifiable { let id: String; let name: String }
struct AgentLink: Decodable, Identifiable {
    let provider: String; let sessionKey: String; let chatID: String; let enabled: Bool
    var id: String { provider + "|" + sessionKey }
}
struct AgentSetupState: Decodable {
    let ok: Bool; let note: String
    let states: [String]?
    let hermesEnabled: Bool?
    let choices: [AgentChoice]?
    let chats: [AgentChat]?
    let hasMore: Bool?
    let links: [AgentLink]?
    let bridgeHealth: [AgentBridgeHealth]?
    let telegramCompatibility: TelegramCompatibility?
}
struct TelegramCompatibility: Decodable {
    let supported: Bool; let installed: Bool; let detail: String
}

struct AgentBridgeHealth: Decodable {
    let provider: String
    let enabled: Bool
    let ready: Bool
    let detail: String
}

struct AgentSetupView: View {
    @ObservedObject var module: BeepsterModule
    @State private var selectedAgent = ""
    @State private var selectedChat = ""
    @State private var confirmInstall = false
    @State private var confirmOpenClaw = false
    @State private var confirmLink = false
    var body: some View {
        VStack(alignment:.leading, spacing:14) {
            Label("Watch approval delivery: not verified by this connection check",systemImage:"exclamationmark.circle").foregroundStyle(.orange)
            HStack {
                Button("Check agent connections") { module.agentLinks() }
                if module.agentBusy { ProgressView().controlSize(.small) }
            }
            Text(module.agentMessage).font(.callout).textSelection(.enabled)
            ForEach(module.agentState?.states ?? [], id: \.self) { Text($0).font(.callout).foregroundStyle(.secondary) }
            GroupBox("OpenClaw") {
                VStack(alignment:.leading,spacing:8) {
                    Text("Pair this Mac's approval-only access, then choose an agent session and its matching Telegram chat below. Review any device request in OpenClaw. Existing local Telegram sessions are discovered automatically.")
                    Button("Pair / manage OpenClaw access") { module.optionalApprovals() }
                    if let compatibility = module.agentState?.telegramCompatibility {
                        Text(compatibility.detail).font(.callout).foregroundStyle(.secondary)
                        if compatibility.supported && !compatibility.installed {
                            Button("Enable Telegram approval text") { confirmOpenClaw = true }
                        }
                    }
                }.frame(maxWidth:.infinity,alignment:.leading).padding(6)
            }
            GroupBox("Hermes") {
                VStack(alignment:.leading,spacing:8) {
                    if module.agentState?.hermesEnabled == true {
                        Label("Bridge installed and enabled",systemImage:"checkmark.circle.fill").foregroundStyle(.green)
                        Text("If Hermes has not restarted since installation, restart it when idle. Then request a task needing approval in Telegram and check connections here. The first pending request identifies the Hermes session.")
                    } else {
                        Text("Install the optional bridge for the default local Hermes installation. No agent will be restarted and no approval will be sent.")
                        Button("Install / enable Hermes bridge") { confirmInstall = true }
                    }
                }.frame(maxWidth:.infinity,alignment:.leading).padding(6)
            }
            GroupBox("Link a Telegram conversation") {
                VStack(alignment:.leading,spacing:10) {
                    Picker("Agent session", selection:$selectedAgent) {
                        Text("Choose an agent session…").tag("")
                        ForEach(module.agentState?.choices ?? []) { choice in
                            Text("\(choice.provider) — \(choice.label ?? choice.sessionKey)").tag(choice.id)
                        }
                    }
                    if let choice = module.agentState?.choices?.first(where:{$0.id == selectedAgent}) {
                        Text(choice.sessionKey).font(.caption).textSelection(.enabled)
                    }
                    Picker("Beeper Telegram chat", selection:$selectedChat) {
                        Text("Choose its Telegram chat…").tag("")
                        ForEach(module.agentState?.chats ?? []) { chat in Text(chat.name).tag(chat.id) }
                    }
                    HStack {
                        Button("Save link") { confirmLink = true }.disabled(selectedAgent.isEmpty || selectedChat.isEmpty)
                        if module.agentState?.hasMore == true {
                            Button("Load more chats") { module.agentPages += 1; module.agentLinks() }
                        }
                    }
                    Text("Choose the same conversation in both lists. Beepster never guesses a match. Remote or non-default agent installations are not automatically discovered.").font(.caption)
                }.padding(6)
            }
            GroupBox("Saved links") {
                VStack(alignment:.leading,spacing:10) {
                    if (module.agentState?.links ?? []).isEmpty { Text("No saved links yet.").foregroundStyle(.secondary) }
                    ForEach(module.agentState?.links ?? []) { link in
                        VStack(alignment:.leading) {
                            Text("\(link.provider) → \(module.agentState?.chats?.first(where:{$0.id == link.chatID})?.name ?? link.chatID)")
                            Text(link.sessionKey).font(.caption).textSelection(.enabled)
                            if link.enabled {
                                Button("Disable link") { module.agentCommand(["action":"disable","provider":link.provider,"sessionKey":link.sessionKey,"chatID":link.chatID]) }
                            } else { Text("Disabled").foregroundStyle(.secondary) }
                        }
                    }
                }.frame(maxWidth:.infinity,alignment:.leading).padding(6)
            }
            Text("On your phone, enable Show pending agent approvals in Beepster settings. Pending actions then appear inside the linked watch chat with a description and Approve once / Deny. Linking never approves an action.").font(.callout)
        }
        .disabled(module.agentBusy || module.busy)
        .onAppear { if module.agentState == nil { module.agentLinks() } }
        .alert("Install Hermes approval bridge?",isPresented:$confirmInstall) {
            Button("Install and enable") { module.agentCommand(["action":"install"]) }
            Button("Cancel",role:.cancel) {}
        } message: { Text("This enables a local plugin that lets Beepster resolve exact pending Telegram approvals. Existing plugin files are backed up. Hermes will not restart automatically.") }
        .alert("Enable OpenClaw Telegram text fallback?",isPresented:$confirmOpenClaw) {
            Button("Back up and install") { module.agentCommand(["action":"install-openclaw-fallback"]) }
            Button("Cancel",role:.cancel) {}
        } message: { Text("Adds exact request IDs and reply choices to OpenClaw Telegram change cards. Permissions and native buttons are unchanged. Supported versions only; a backup is saved. Restart OpenClaw when idle afterward. Updates may require reinstalling this compatibility fix.") }
        .alert("Link these conversations?",isPresented:$confirmLink) {
            Button("Save link") {
                if let choice = module.agentState?.choices?.first(where:{$0.id == selectedAgent}) {
                    module.agentCommand(["action":"link","provider":choice.provider,"sessionKey":choice.sessionKey,"chatID":selectedChat])
                }
            }
            Button("Cancel",role:.cancel) {}
        } message: { Text("Confirm that the agent session and Beeper chat are the same Telegram conversation. This replaces any previous link for that session; it does not approve a request.") }
    }
}
