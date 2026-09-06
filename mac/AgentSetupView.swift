import SwiftUI

struct AgentChoice: Decodable, Identifiable {
    let provider: String
    let sessionKey: String
    let label: String?
    let linkable: Bool?
    var id: String { provider + "|" + sessionKey }
}
struct AgentChat: Decodable, Identifiable { let id: String; let name: String }
struct AgentLink: Decodable, Identifiable {
    let provider: String; let sessionKey: String; let chatID: String; let enabled: Bool
    var id: String { provider + "|" + sessionKey }
}
struct ThreadPrompt: Decodable, Identifiable {
    let provider: String; let sessionKey: String; let chatID: String; let defaultText: String?
    let text: String; let revision: String
    var id: String { provider + "|" + sessionKey + "|" + chatID }
}
struct AgentSetupState: Decodable {
    let ok: Bool; let note: String
    let threadPrompts: [ThreadPrompt]?
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
    @State private var confirmInstall = false
    @State private var confirmOpenClaw = false
    @State private var confirmPromptSupport = false
    var body: some View {
        VStack(alignment:.leading, spacing:14) {
            Label("Watch approval delivery: not verified by this connection check",systemImage:"exclamationmark.circle").foregroundStyle(.orange)
            HStack {
                Button("Check agent connections") { module.agentLinks() }
                if module.agentBusy || module.agentRefreshing { ProgressView().controlSize(.small) }
            }
            Text(module.agentMessage).font(.callout).textSelection(.enabled)
            ForEach(module.agentState?.states ?? [], id: \.self) { Text($0).font(.callout).foregroundStyle(.secondary) }
            GroupBox("OpenClaw") {
                VStack(alignment:.leading,spacing:8) {
                    Text("Pair this Mac's approval-only access, then choose an agent session and its matching Telegram chat below. Review any device request in OpenClaw. Existing local Telegram sessions are discovered automatically.")
                    Button("Pair / manage OpenClaw access") { module.optionalApprovals() }
                    Button("Install / update OpenClaw thread prompts") { confirmPromptSupport = true }
                    if let compatibility = module.agentState?.telegramCompatibility {
                        Text(compatibility.detail).font(.callout).foregroundStyle(.secondary)
                        if compatibility.supported && !compatibility.installed {
                            Button("Enable Telegram approval text") { confirmOpenClaw = true }
                        }
                    }
                    AgentLinkSection(module: module, provider: "openclaw", title: "OpenClaw")
                }.frame(maxWidth:.infinity,alignment:.leading).padding(6)
            }
            GroupBox("Hermes") {
                VStack(alignment:.leading,spacing:8) {
                    if module.agentState?.hermesEnabled == true {
                        Button("Update Hermes bridge for thread prompts") { confirmInstall = true }
                        Label("Bridge installed and enabled",systemImage:"checkmark.circle.fill").foregroundStyle(.green)
                        Text("If Hermes has not restarted since installation, restart it when idle. Then request a task needing approval in Telegram and check connections here. The first pending request identifies the Hermes session.")
                    } else {
                        Text("Install the optional bridge for the default local Hermes installation. No agent will be restarted and no approval will be sent.")
                        Button("Install / enable Hermes bridge") { confirmInstall = true }
                    }
                    AgentLinkSection(module: module, provider: "hermes", title: "Hermes")
                }.frame(maxWidth:.infinity,alignment:.leading).padding(6)
            }
            Text("On your phone, enable Show pending agent approvals in Beepster settings. Pending actions then appear inside the linked watch chat with a description and Approve once / Deny. Linking never approves an action.").font(.callout)
        }
        .alert("Install OpenClaw thread prompt support?", isPresented: $confirmPromptSupport) {
            Button("Install") { module.agentCommand(["action":"install-openclaw-prompts"]) }
            Button("Cancel",role:.cancel) {}
        } message: { Text("Installs a local plugin with permission to add system instructions. It reads only the prompt saved for the exact enabled link, preserving OpenClaw’s base prompt. Restart OpenClaw when idle afterward. Existing plugin files are backed up.") }
        .disabled(module.agentBusy || module.busy)
        .onAppear { if module.agentState == nil { module.agentLinks() } }
        .alert("Install Hermes approval bridge?",isPresented:$confirmInstall) {
            Button("Install and enable") { module.agentCommand(["action":"install"]) }
            Button("Cancel",role:.cancel) {}
        } message: { Text("This enables a local plugin that lets Beepster resolve exact pending Telegram approvals and apply your saved system instructions only to the linked thread. Existing plugin files are backed up. Hermes will not restart automatically.") }
        .alert("Enable OpenClaw Telegram text fallback?",isPresented:$confirmOpenClaw) {
            Button("Back up and install") { module.agentCommand(["action":"install-openclaw-fallback"]) }
            Button("Cancel",role:.cancel) {}
        } message: { Text("Adds exact request IDs and reply choices to OpenClaw Telegram change cards. Permissions and native buttons are unchanged. Supported versions only; a backup is saved. Restart OpenClaw when idle afterward. Updates may require reinstalling this compatibility fix.") }

    }
}

struct AgentLinkSection: View {
    @ObservedObject var module: BeepsterModule
    let provider: String
    let title: String
    @State private var selectedAgent = ""
    @State private var selectedChat = ""
    @State private var confirmLink = false
    @State private var editingPrompt: ThreadPrompt?
    private var choices: [AgentChoice] { (module.agentState?.choices ?? []).filter { $0.provider == provider && $0.linkable != false } }
    private var links: [AgentLink] { (module.agentState?.links ?? []).filter { $0.provider == provider } }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GroupBox("Link a Telegram conversation") {
                VStack(alignment:.leading,spacing:10) {
                    Picker("\(title) session", selection:$selectedAgent) {
                        Text("Choose a \(title) session…").tag("")
                        ForEach(choices) { choice in
                            Text(choice.label ?? choice.sessionKey).tag(choice.id)
                        }
                    }
                    if let choice = choices.first(where:{$0.id == selectedAgent}) {
                        Text(choice.sessionKey).font(.caption).textSelection(.enabled)
                    }
                    if choices.isEmpty {
                        Text("No Telegram sessions found for \(title). Send a message to \(title) in Telegram, then refresh.").font(.callout).foregroundStyle(.secondary)
                    }
                    Picker("Beeper Telegram chat", selection:$selectedChat) {
                        Text("Choose its Telegram chat…").tag("")
                        ForEach(module.agentState?.chats ?? []) { chat in Text(chat.name).tag(chat.id) }
                    }
                    HStack {
                        Button("Save link") { confirmLink = true }.disabled(selectedAgent.isEmpty || selectedChat.isEmpty || choices.first(where: { $0.id == selectedAgent })?.linkable == false)
                        if module.agentState?.hasMore == true {
                            Button("Load more chats") { module.agentPages += 1; module.agentLinks() }
                        }
                    }
                    Text("Choose the same conversation in both lists. Beepster never guesses a match. Remote or non-default agent installations are not automatically discovered.").font(.caption)
                }.padding(6)
            }
            GroupBox("Saved links") {
                VStack(alignment:.leading,spacing:10) {
                    if links.isEmpty { Text("No saved links yet.").foregroundStyle(.secondary) }
                    ForEach(links) { link in
                        VStack(alignment:.leading) {
                            Text("\(module.agentState?.chats?.first(where:{$0.id == link.chatID})?.name ?? link.chatID)")
                            Text(choices.first(where: { $0.provider == link.provider && $0.sessionKey == link.sessionKey })?.label ?? link.sessionKey).font(.caption).textSelection(.enabled)
                            if link.enabled {
                                if let prompt = module.agentState?.threadPrompts?.first(where: { $0.provider == link.provider && $0.sessionKey == link.sessionKey && $0.chatID == link.chatID }) {
                                    Button("Edit thread prompt…") { editingPrompt = prompt }
                                }
                                Button("Disable link") { module.agentCommand(["action":"disable","provider":link.provider,"sessionKey":link.sessionKey,"chatID":link.chatID]) }
                            } else { Text("Disabled").foregroundStyle(.secondary) }
                        }
                    }
                }.frame(maxWidth:.infinity,alignment:.leading).padding(6)
            }

        }
        .sheet(item: $editingPrompt) { prompt in ThreadPromptEditor(module: module, prompt: prompt) }
        .onChange(of: choices.map(\.id)) { _, ids in
            if !ids.contains(selectedAgent) { selectedAgent = "" }
        }
        .alert("Link these conversations?",isPresented:$confirmLink) {
            Button("Save link") {
                if let choice = choices.first(where:{$0.id == selectedAgent}) {
                    module.agentCommand(["action":"link","provider":provider,"sessionKey":choice.sessionKey,"chatID":selectedChat])
                }
            }
            Button("Cancel",role:.cancel) {}
        } message: { Text("Confirm that the agent session and Beeper chat are the same Telegram conversation. This replaces any previous link for that session; it does not approve a request.") }
    }
}

struct ThreadPromptEditor: View {
    @ObservedObject var module: BeepsterModule
    let prompt: ThreadPrompt
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var savedRevision = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Thread system instructions").font(.title2.weight(.semibold))
            Text("\(prompt.provider) · \(prompt.sessionKey)").font(.caption).textSelection(.enabled)
            Text("Adds instructions for this connected thread while preserving the agent’s base prompt. Install or update prompt support in the agent section, then restart that agent when idle. Later edits apply on its next message. A Pebble-focused default is already filled in. Edit it to suit this thread, or clear and save to turn off these additional instructions.").font(.callout)
            TextEditor(text: $text).font(.body).frame(minHeight: 220).border(Color.secondary.opacity(0.3))
            Text("\(text.count) / 12,000 characters").font(.caption)
            Text(module.agentMessage).font(.callout).foregroundStyle(.secondary)
            HStack {
                Button("Close") { dismiss() }
                Button("Restore Pebble default") { if let value = prompt.defaultText { text = value } }.disabled(prompt.defaultText == nil)
                Spacer()
                Button("Save thread prompt") {
                    module.agentCommand(["action":"save-prompt","provider":prompt.provider,"sessionKey":prompt.sessionKey,"chatID":prompt.chatID,"text":text,"revision":savedRevision])
                }.buttonStyle(.borderedProminent).disabled(module.agentBusy || text.count > 12000)
            }
        }.padding(24).frame(width: 620)
        .onAppear { text = prompt.text; savedRevision = prompt.revision }
        .onChange(of: module.agentBusy) { _, busy in
            if !busy, let current = module.agentState?.threadPrompts?.first(where: { $0.id == prompt.id }), current.text == text { savedRevision = current.revision }
        }
    }
}
