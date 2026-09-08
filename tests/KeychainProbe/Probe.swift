import Foundation
import Security
@main struct Probe {
    static func main() throws {
        let base: [String: Any] = [kSecClass as String:kSecClassGenericPassword,
            kSecAttrService as String:"org.organikapps.pebbleconnector.synthetic-keychain-probe",
            kSecAttrAccount as String:CommandLine.arguments.dropFirst().first ?? UUID().uuidString]
        var item=base;item[kSecValueData as String]=Data("synthetic".utf8)
        let added=SecItemAdd(item as CFDictionary,nil)
        guard added==errSecSuccess else { throw NSError(domain:NSOSStatusErrorDomain,code:Int(added)) }
        var removed=false
        defer { if !removed { SecItemDelete(base as CFDictionary) } }
        let child=Process(),pipe=Pipe()
        child.executableURL=Bundle.main.url(forResource:"keychain-probe-tool",withExtension:nil)!
        child.arguments=[base[kSecAttrAccount as String] as! String]
        child.standardOutput=pipe;child.standardError=FileHandle.standardError;child.standardInput=FileHandle.nullDevice
        try child.run()
        let data=pipe.fileHandleForReading.readDataToEndOfFile();child.waitUntilExit()
        var result=(try JSONSerialization.jsonObject(with:data)) as! [String:Any]
        var query=base;query[kSecReturnData as String]=true
        var value:CFTypeRef?
        result["parentReadStatus"]=SecItemCopyMatching(query as CFDictionary,&value)
        result["parentSawUpdate"]=(value as? Data)==Data("synthetic-updated".utf8)
        let deleted=SecItemDelete(base as CFDictionary);removed=deleted==errSecSuccess
        result["syntheticItemRemoved"]=removed
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]))
    }
}
