import Foundation
import CryptoKit

final class Feed: NSObject, XMLParserDelegate {
    var enclosure: [String: String]?
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String]) {
        if elementName == "enclosure" { enclosure = attributeDict }
    }
}
let arguments = CommandLine.arguments
precondition(arguments.count == 4, "Usage: verify-appcast.swift appcast.xml archive.dmg Info.plist")
let feed = Feed()
let parser = XMLParser(contentsOf: URL(fileURLWithPath: arguments[1]))!
parser.delegate = feed
precondition(parser.parse(), "Invalid update XML")
let enclosure = feed.enclosure!
let archiveURL = URL(fileURLWithPath: arguments[2])
let archive = try Data(contentsOf: archiveURL, options: .mappedIfSafe)
let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: URL(fileURLWithPath: arguments[3])), format: nil) as! [String: Any]
let key = try Curve25519.Signing.PublicKey(rawRepresentation: Data(base64Encoded: info["SUPublicEDKey"] as! String)!)
let signature = Data(base64Encoded: enclosure["sparkle:edSignature"]!)!
precondition(key.isValidSignature(signature, for: archive), "Archive signature does not match bundled key")
precondition(enclosure["length"] == String(archive.count), "Archive length does not match feed")
precondition(URL(string: enclosure["url"]!)?.lastPathComponent == archiveURL.lastPathComponent, "Wrong download filename")
precondition(enclosure["url"]!.hasPrefix("https://"), "Download must use HTTPS")
print("PASS: appcast signature, archive length, and HTTPS download match the final DMG and bundled public key")
