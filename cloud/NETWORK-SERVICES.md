# App Review: incoming network connections

The `com.apple.security.network.server` entitlement is required for this app's core function: it hosts authenticated local HTTP services that connect the Pebble phone companion to the user's Mac data and Apple Home. These are incoming connections, not only outbound API requests. The entitlement remains necessary even though listeners bind only to loopback.

| Component | Incoming listener | User-facing purpose | Source |
| --- | --- | --- | --- |
| Reminderz in main Mac executable | `127.0.0.1:7843` | Read lists, add/update/complete Apple Reminders from the watch | `mac/ReminderzModule.swift`, `ReminderServer.start` |
| Notesy bundled Node child, inherited sandbox | `127.0.0.1:7844` | Browse selected notes, render content, save watch dictation | `Resources/Notesy/server.js`, `server.listen` |
| Beepster bundled Node child, inherited sandbox | `127.0.0.1:8794` | Serve watch chats/media and forward user-requested actions to Beeper Desktop | `Resources/Beepster/gateway/src/cli.js`, `server.listen` |
| Bundled Pome Catalyst helper, own sandbox | `127.0.0.1:7855` | Serve Apple Home rooms/services/scenes, requested controls and optional camera frames | `camera/CacheHTTP.swift`, `CacheHTTP.start`; `camera/HomeControl.swift` |

Main app and Pome helper have network-server permission. Bundled Node/native child tools inherit the main sandbox. Beeper Desktop's API on23373 and optional Hermes/OpenClaw bridges are external integrations, not additional listeners owned by Connector.

When a user selects Start private connection, their separately installed Tailscale handles private HTTPS from their authenticated tailnet and forwards it to these loopback HTTP services. Suggested HTTPS ports are Notesy10448, Beepster10444, Reminderz10447 and Pome10550; matching existing routes are reused. Connector does not open a public listener or enable Tailscale Funnel. The phone supplies each service's pairing credential on authenticated data/control requests. Some local setup/health routes are intentionally available before pairing; these are not unauthenticated data/control access.

## How a reviewer can reach the functionality

1. Launch Connector and choose Reminderz in the sidebar. Select Allow Reminders and start sync, and allow access when macOS asks. This starts the main executable's incoming loopback service on7843; no third-party home-control app is needed.
2. To exercise Pome, configure Apple Home/iCloud on the Mac, select Pome → Connect Apple Home, and allow Home access. The bundled helper accepts incoming HTTP on7855. Home controls do not require enabled camera schedules.
3. Connect Tailscale on Mac and phone, select Start private connection, then follow the app's numbered phone-pairing step. Requests from the paired Pebble companion reach the local listeners through that private route.
4. Closing Connector's window leaves the services available; normal Quit stops the owned listeners.

The next archive uses accepted local build39 sources. Submitted build37 already used incoming Reminderz, Notesy and Beepster services and Pome camera HTTP; the replacement also serves direct Apple Home controls on the existing Pome port. Removing network.server would break the core incoming service functionality in both versions. This document describes implementation and review steps; it does not assert Apple approval.
