import Foundation
import Darwin

@main struct LegacyGatewayHandoffTests {
    static func main() {
        let expected = "/Users/Shared/test/Library/Application Support/Beepster/bin/node"
        assert(LegacyGatewayHandoff.matches("service {\n program = \(expected)\n}", expectedProgram: expected))
        assert(!LegacyGatewayHandoff.matches("program = /some/other/node", expectedProgram: expected))
        assert(!LegacyGatewayHandoff.matches("arguments = \(expected)", expectedProgram: expected))
        assert(!LegacyGatewayHandoff.matches("program = \(expected)-other", expectedProgram: expected))
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        assert(descriptor >= 0)
        defer { close(descriptor) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        assert(withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } } == 0)
        assert(listen(descriptor, 1) == 0)
        var size = socklen_t(MemoryLayout<sockaddr_in>.size)
        assert(withUnsafeMutablePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(descriptor, $0, &size) } } == 0)
        assert(LegacyGatewayHandoff.portIsOccupied(UInt16(bigEndian: address.sin_port)))
        assert(!LegacyGatewayHandoff.portIsOccupied(0))
        print("PASS: exact legacy program recognition and occupied/free loopback ports")
    }
}
