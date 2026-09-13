# Shared Connector readiness work

Josh authorized the final latest Store submission and release on 2026-09-13. Exact-candidate validation still applies; additional Connector-dependent development requires explicit approval under AGENTS.md.
Store submission 97 remains unchanged until the coordinator replaces it. GitHub build 106 is the latest installed build at the start of the authorized switch to Pome-enabled local build 107.

## Interface

Errors have an adjacent Fix action on Overview, app Status pages, G2 checks, and camera checks. Actions use the existing permission, token, folder, service or route mechanisms; no permission database resets or automatic widening of access. Agent errors open only the relevant provider. App pages separate Status, Setup & pairing, and Advanced controls. New unconfigured apps open setup first.

Edition changes have a persistent checklist in Settings, surfaced on Overview for configured users until reviewed. Dismissing it does not mark health checks as passed. The checklist explains application replacement, permission and folder reauthorization, existing pairing, device tests, and Pome availability. It makes no claim that the signing transition has passed acceptance.

## Data and permissions

No new recipient, data collection, network route or permission entitlement is introduced by these screens. Existing folder selections remain explicit system pickers. Calendar Fix rechecks EventKit authorization and requests full access again if unavailable; an unsuccessful request opens Calendar Privacy with a clear explanation. Calendar permission status updates independently of network checks and on app activation/EventKit notifications. Contacts and Reminders use the relevant permission request or Privacy pane. Home access opens the HomeKit Privacy pane. Optional agent editing uses existing provider-scoped configuration and Keychain storage. Review reference: https://developer.apple.com/design/human-interface-guidelines/privacy (rechecked 2026-09-13).

## Required transition acceptance

1. On a disposable macOS account, install the exact Developer ID GitHub candidate. Set up Notesy, Beepster, Reminders and Eventz/DayFrame; record settings and pairing fingerprints without plaintext secrets.
2. Update to another Developer ID candidate and verify unchanged signing requirements, permissions, bookmarks, Keychain reads, ownership, login registration and device delivery.
3. Replace with the exact Store-signed export through the supported installation route. Do not reset privacy grants. Record every prompt and any inaccessible setting. Exercise each red Fix action and confirm it recovers the affected integration.
4. Confirm existing pairing and settings survive; reselect inaccessible scoped folders through the picker. Verify optional Hermes/OpenClaw configuration and hidden connector preferences. Set up and test Pome separately.
5. Close/reopen, quit/relaunch and reboot. Verify a single installed app/login owner, no obsolete service, and real phone/watch/glasses delivery.

Current status: both compile conditions pass; upgrade preflight tests and canonical same-edition installation regression checks through 106 pass. Installed 104 recognized the previously approved Calendar and Contacts permissions after restart; fresh grant/revoke-without-restart still needs acceptance. Josh accepted the separate title and green device-button appearance in 106. Exact signed upgrade and Store transition, first-run/denied UI, restart and device checks remain pending. Neither this checklist nor a green Mac endpoint substitutes for those tests. Any discovered migration defect requires an implemented repair before release.
