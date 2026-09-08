import Foundation
import Darwin

// This validates the known legacy service, never an arbitrary port owner.
enum LegacyGatewayHandoff {
    static func portIsOccupied(_ port: UInt16 = 8794) -> Bool {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { return true }
        defer { close(descriptor) }
        var reuse: Int32 = 1
        _ = setsockopt(descriptor, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return result != 0
    }
    static var target: String { "gui/\(getuid())/org.beepster.gateway" }
    static var expectedProgram: String? {
        var account = passwd()
        var found: UnsafeMutablePointer<passwd>?
        var buffer = [CChar](repeating: 0, count: 32_768)
        return buffer.withUnsafeMutableBufferPointer { storage in
            guard getpwuid_r(getuid(), &account, storage.baseAddress, storage.count, &found) == 0,
                  found != nil, let directory = account.pw_dir else { return nil }
            return URL(fileURLWithPath: String(cString: directory))
                .appendingPathComponent("Library/Application Support/Beepster/bin/node").path
        }
    }
    static func matches(_ description: String, expectedProgram: String) -> Bool {
        description.split(separator: "\n").contains {
            $0.trimmingCharacters(in: .whitespaces) == "program = " + expectedProgram
        }
    }
}
