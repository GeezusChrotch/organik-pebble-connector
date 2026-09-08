import Foundation
@main struct HealthRequirementsTests {
    @MainActor static func main() {
        // A working Notesy service must not become broken merely because no phone has
        // contacted it since this launch (normal after an upgrade or while the watch is idle).
        let notesy = NotesyService()
        notesy.running = true
        notesy.vaultReady = true
        notesy.privateReady = true
        assert(notesy.requirements.allSatisfy(\.ready))
        assert(!notesy.requirements.contains { $0.id == "phone" })
        let external = ExternalService(name: "HealthTests", description: "", localPort: 8423, privatePort: 10443, healthPath: "/status")
        external.localReady = true
        external.privateReady = true
        assert(external.requirements.allSatisfy(\.ready))
        // Actual failures must still make the connector unhealthy.
        external.privateReady = false
        assert(external.requirements.contains { !$0.ready })
        let beepster = BeepsterModule()
        for code in ["MEDIA_PERMISSION", "CHECK_FAILED", "NO_LOCAL_ATTACHMENTS"] {
            beepster.updateMediaAccess(["code": code])
            assert(beepster.requirements.first { $0.id == "attachments" }?.ready == false)
        }
        beepster.updateMediaAccess(["code": "READY", "allowed": true])
        assert(beepster.requirements.first { $0.id == "attachments" }?.ready == true)
        beepster.updateMediaAccess(["code": "MEDIA_PERMISSION", "allowed": false])
        assert(beepster.requirements.first { $0.id == "attachments" }?.ready == false)
        assert(beepster.requirements.filter { $0.id == "attachments" }.count == 1)
        beepster.updateAgentHealth([
            AgentBridgeHealth(provider:"hermes", enabled:true, ready:false, detail:"Offline"),
            AgentBridgeHealth(provider:"openclaw", enabled:false, ready:true, detail:"Disabled")])
        assert(beepster.agentRequirements.count == 1)
        assert(beepster.agentRequirements[0].title == "Hermes bridge")
        assert(!beepster.agentRequirements[0].ready)
        beepster.updateAgentHealth([
            AgentBridgeHealth(provider:"hermes", enabled:true, ready:true, detail:"Connected"),
            AgentBridgeHealth(provider:"openclaw", enabled:true, ready:true, detail:"Connected")])
        assert(beepster.agentRequirements.count == 2)
        assert(beepster.agentRequirements.allSatisfy(\.ready))
        beepster.updateAgentHealth(nil)
        assert(beepster.agentRequirements.count == 2)
        assert(beepster.agentRequirements.allSatisfy { !$0.ready })
        beepster.updateAgentHealth([])
        assert(beepster.agentRequirements.isEmpty)
        let reminderz = ReminderzModule()
        assert(!beepster.requirements.contains { $0.id == "phone" })
        assert(!reminderz.requirements.contains { $0.id == "phone" })
        print("PASS: unconfirmed phone activity is not a failed requirement; real route failures remain visible")
    }
}
