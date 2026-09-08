import Foundation
import Security
import LocalAuthentication
@main struct Tool {
    static func main() throws {
        guard CommandLine.arguments.count == 2 else { exit(64) }
        let context = LAContext(); context.interactionNotAllowed = true
        let base: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"org.organikapps.pebbleconnector.synthetic-keychain-probe",
            kSecAttrAccount as String:CommandLine.arguments[1], kSecUseAuthenticationContext as String:context]
        FileHandle.standardError.write(Data("child: reading synthetic item\n".utf8))
        var query=base;query[kSecReturnData as String]=true
        var value: CFTypeRef?
        let read=SecItemCopyMatching(query as CFDictionary,&value)
        FileHandle.standardError.write(Data("child: read status \(read)\n".utf8))
        let recognized=(value as? Data)==Data("synthetic".utf8)
        let updated=read==errSecSuccess ? SecItemUpdate(base as CFDictionary,[kSecValueData as String:Data("synthetic-updated".utf8)] as CFDictionary) : read
        FileHandle.standardError.write(Data("child: update status \(updated)\n".utf8))
        let data=try JSONSerialization.data(withJSONObject:["readStatus":read,"recognizedSyntheticValue":recognized,"updateStatus":updated])
        FileHandle.standardOutput.write(data)
    }
}
