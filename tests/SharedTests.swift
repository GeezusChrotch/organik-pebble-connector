import Foundation
@main struct SharedTests {
    static func main() throws {
        assert(commandEnvironment(executable: "/Applications/Tailscale.app/Contents/MacOS/Tailscale", inherited: [:])["TERM"] == "dumb")
        assert(commandEnvironment(executable: "/usr/local/bin/tailscale", inherited: ["TERM": "xterm"])["TERM"] == "xterm")
        assert(commandEnvironment(executable: "/usr/bin/other", inherited: [:])["TERM"] == nil)
        let target="http://127.0.0.1:7844"
        let existing:[String:Any] = ["Web":["sample.ts.net:12448":["Handlers":["/":["Proxy":target]]]]]
        let reuse=try PrivateConnection.plan(target:target,port:10448,configuration:existing)
        assert(reuse == .reuse("https://sample.ts.net:12448"))
        let occupied:[String:Any] = ["Web":["sample.ts.net:10448":["Handlers":["/":["Proxy":"http://127.0.0.1:9999"]]]]]
        do {_ = try PrivateConnection.plan(target:target,port:10448,configuration:occupied);fatalError("Overwrote another service") }catch{}
        let create=try PrivateConnection.plan(target:target,port:10449,configuration:occupied)
        assert(create == .create(10449))
        let publicRoute:[String:Any] = ["Web":existing["Web"]!,"AllowFunnel":["sample.ts.net:12448":true]]
        assert(PrivateConnection.origin(target:target,configuration:publicRoute) == nil)
        let tcp:[String:Any] = ["TCP":["10448":["TCPForward":"127.0.0.1:9999"]]]
        do {_ = try PrivateConnection.plan(target:target,port:10448,configuration:tcp);fatalError("Overwrote TCP listener") }catch{}
        assert(PrivateConnection.canonical("http://localhost:7844/") == PrivateConnection.canonical(target))
        assert(PrivateConnection.canonical("http://localhost:7844/?secret=x") != PrivateConnection.canonical(target))
        print("PASS: existing private addresses reused; occupied HTTP and TCP routes preserved; public routes not labeled private; URL matching checked.")
    }
}
