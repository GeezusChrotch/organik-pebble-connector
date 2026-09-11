# Connector 57 review fixes

Built from latest local native source, preserving installed56 runtime resources (including G2 and speech). Installed at the canonical Applications path; previous56 archived outside Applications. Local development signing and sandbox validation passed. Stable-toolchain universal Release Cloud-project build passed; this is not proof of Cloud distribution signing or Apple acceptance.

## Permission wording

SwiftUI Reminders and Calendars setup actions now use Continue. The corresponding AppKit actions and next-step labels also use Continue. Contacts troubleshooting uses Continue. For a new Contacts permission, Connector explains local matching, delivery to the paired phone/watch, optional access and revocation before Continue / Not Now, then invokes the macOS permission dialog. Existing permission grants are reused. No permission database reset or synthetic grant was performed.

## Contacts data flow

- cloud/helpers/BeepsterContacts.swift: CNContactFetchRequest reads local name/nickname/organization, email and telephone fields. enumerateContacts matches only requested normalized identifiers. The response contains matching names plus opaque SHA256-derived grouping keys; it does not return the entire address book.
- cloud/Resources/Beepster/gateway/src/contact-resolver.js: launches local helper, parses names/contactKeys, maintains a bounded in-memory cache. No network upload in this resolver.
- cloud/Resources/Beepster/gateway/src/beeper-client.js: uses matching names for conversation/sender display and contactGroup for grouping.
- cloud/Resources/Beepster/gateway/src/server.js: bearer-token guard precedes /v1/chats and message responses. Those responses deliver contact-derived display data to the paired client via its configured private route.

Do not claim Contacts data never leaves the Mac. Matched names and grouping identifiers leave for the user's paired phone/watch. No Organik-hosted address-book upload path was found in this flow. The in-app disclosure and PRIVACY.md now make this distinction. Do not treat this code trace as blanket proof about Beeper/Tailscale's independently operated services.

## Main window

File > Open Connector, Command-O, now uses SwiftUI openWindow(id: connector), allowing recreation after closing, and activates the app. applicationShouldTerminateAfterLastWindowClosed remains false. Normal Quit retains owned-service shutdown behavior. Runtime close/reopen and fresh-permission dialog checks remain pending: Computer Use crashes on exact-path getApp even after reset. No UI test is claimed from a successful compile.

## Runtime and G2

Installed57's connection checks settled to all green. Local speech/helper/EvenG2 payload was preserved. Four G2 server/local-speech tests passed. Pome owner confirmed current CacheTest.swift and CameraWindowHost.swift match the accepted camera50 frozen sources. G2 owner reports user acceptance of microphone/transcription, camera and room controls on0.1.11. Broader language coverage and0.1.12 menu/dictation UX remain pending. Coordinator owns Cloud dispatch, review submission and publication gates.
