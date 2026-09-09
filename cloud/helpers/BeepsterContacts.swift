import AppKit
import Contacts
import CryptoKit
import Foundation

struct LookupRequest: Decodable {
    let identifiers: [String]
}

struct LookupResponse: Encodable {
    let authorized: Bool
    let names: [String: String]
    let contactKeys: [String: String]
    let errorDomain: String?
    let errorCode: Int?
}

func writeLookupResponse(_ response: LookupResponse, outputPath: String?) throws {
    let data = try JSONEncoder().encode(response)
    if let outputPath { try data.write(to: URL(fileURLWithPath: outputPath), options: .atomic) }
    else { FileHandle.standardOutput.write(data) }
}

func authorizationLabel(_ status: CNAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "not_determined"
    @unknown default: return "unknown"
    }
}

func displayName(_ contact: CNContact) -> String? {
    if let name = CNContactFormatter.string(from: contact, style: .fullName)?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
        return name
    }
    let nickname = contact.nickname.trimmingCharacters(in: .whitespacesAndNewlines)
    if !nickname.isEmpty { return nickname }
    let organization = contact.organizationName.trimmingCharacters(in: .whitespacesAndNewlines)
    return organization.isEmpty ? nil : organization
}

func normalizeIdentifier(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.contains("@") {
        return trimmed.replacingOccurrences(of: "^mailto:", with: "", options: [.regularExpression, .caseInsensitive]).lowercased()
    }
    let digits = trimmed.filter(\.isNumber)
    guard digits.count >= 7 else { return nil }
    return digits.count == 11 && digits.first == "1" ? String(digits.dropFirst()) : digits
}

func opaqueContactKey(_ identifier: String) -> String {
    SHA256.hash(data: Data(identifier.utf8)).prefix(16)
        .map { String(format: "%02x", $0) }.joined()
}

final class ContactsAuthorizationDelegate: NSObject, NSApplicationDelegate {
    private let store: CNContactStore

    init(store: CNContactStore) {
        self.store = store
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.activate(ignoringOtherApps: true)
        store.requestAccess(for: .contacts) { granted, error in
            if let error { FileHandle.standardError.write(Data("\(error)\n".utf8)) }
            let status = granted ? "authorized" : authorizationLabel(CNContactStore.authorizationStatus(for: .contacts))
            FileHandle.standardOutput.write(Data("\(status)\n".utf8))
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }
}

let store = CNContactStore()
let arguments = CommandLine.arguments
let isLookup = arguments.contains("--lookup") || arguments.contains("--lookup-file")

if let statusIndex = arguments.firstIndex(of: "--status-file"), arguments.count > statusIndex + 1 {
    try authorizationLabel(CNContactStore.authorizationStatus(for: .contacts)).write(
        toFile: arguments[statusIndex + 1], atomically: true, encoding: .utf8)
    exit(0)
}

if arguments.contains("--status") {
    print(authorizationLabel(CNContactStore.authorizationStatus(for: .contacts)))
    exit(0)
}

if !isLookup && !arguments.contains("--status") {
    let initialStatus = CNContactStore.authorizationStatus(for: .contacts)
    if initialStatus != .notDetermined {
        print(authorizationLabel(initialStatus))
        exit(initialStatus == .authorized ? 0 : 1)
    }

    // Contacts authorization is presented by AppKit. Running only a Foundation
    // run loop leaves this LSUIElement helper alive without ever showing TCC's
    // permission sheet.
    let app = NSApplication.shared
    let delegate = ContactsAuthorizationDelegate(store: store)
    app.setActivationPolicy(.accessory)
    app.delegate = delegate
    app.run()
    exit(CNContactStore.authorizationStatus(for: .contacts) == .authorized ? 0 : 1)
}

let fileLookupIndex = arguments.firstIndex(of: "--lookup-file")
let input: Data
let outputPath: String?
if let fileLookupIndex, arguments.count > fileLookupIndex + 2 {
    input = try Data(contentsOf: URL(fileURLWithPath: arguments[fileLookupIndex + 1]))
    outputPath = arguments[fileLookupIndex + 2]
} else {
    input = FileHandle.standardInput.readDataToEndOfFile()
    outputPath = nil
}

guard CNContactStore.authorizationStatus(for: .contacts) == .authorized else {
    try writeLookupResponse(LookupResponse(authorized: false, names: [:], contactKeys: [:],
        errorDomain: nil, errorCode: nil), outputPath: outputPath)
    exit(0)
}

do {
    let request = try JSONDecoder().decode(LookupRequest.self, from: input)
    let nameDescriptor = CNContactFormatter.descriptorForRequiredKeys(for: .fullName)
    let keys: [CNKeyDescriptor] = [nameDescriptor, CNContactNicknameKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor, CNContactEmailAddressesKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor]
    var names: [String: String] = [:]
    var contactKeys: [String: String] = [:]
    let requested = Set(request.identifiers.compactMap(normalizeIdentifier))
    let fetchRequest = CNContactFetchRequest(keysToFetch: keys)

    try store.enumerateContacts(with: fetchRequest) { contact, _ in
        guard let name = displayName(contact) else { return }
        let contactKey = opaqueContactKey(contact.identifier)
        let identifiers = contact.emailAddresses.compactMap { normalizeIdentifier($0.value as String) } +
            contact.phoneNumbers.compactMap { normalizeIdentifier($0.value.stringValue) }
        for identifier in identifiers where requested.contains(identifier) {
            names[identifier] = name
            contactKeys[identifier] = contactKey
        }
    }
    try writeLookupResponse(LookupResponse(authorized: true, names: names, contactKeys: contactKeys,
        errorDomain: nil, errorCode: nil), outputPath: outputPath)
} catch {
    let failure = error as NSError
    try? writeLookupResponse(LookupResponse(authorized: true, names: [:], contactKeys: [:],
        errorDomain: failure.domain, errorCode: failure.code), outputPath: outputPath)
    exit(1)
}
