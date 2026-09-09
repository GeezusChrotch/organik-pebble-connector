import Foundation
import Security

let service = "org.beepster.gateway"
guard CommandLine.arguments.count == 3 else { exit(64) }
let operation = CommandLine.arguments[1]
let account = CommandLine.arguments[2]
let base: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: service,
  kSecAttrAccount as String: account
]

if operation == "get" {
  var query = base
  query[kSecReturnData as String] = true
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  var item: CFTypeRef?
  guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
        let data = item as? Data else { exit(1) }
  FileHandle.standardOutput.write(data)
} else if operation == "set" {
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard !data.isEmpty else { exit(65) }
  let status = SecItemUpdate(base as CFDictionary, [kSecValueData as String: data] as CFDictionary)
  if status == errSecItemNotFound {
    var item = base
    item[kSecValueData as String] = data
    guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { exit(1) }
  } else if status != errSecSuccess { exit(1) }
} else { exit(64) }
