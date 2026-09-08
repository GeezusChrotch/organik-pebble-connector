# Organik Apps Pebble Connector 1.0 — Mac App Store setup

**Prerelease guide. The App Store version is not publicly available yet.** This guide describes the Store build. The older DMG release has different update and background-service behavior.

## Before you start

Use macOS 14 or newer; Pome cameras require macOS 15.2 or newer. Install the Pebble apps you want separately in the Pebble phone app. Install Tailscale on the Mac and phone, sign into the same account, and connect both. Keep the Mac awake and the Connector running when using your watch away from the Mac.

Only install each app's prerequisites if you use it: Beeper Desktop for Beepster, an Obsidian vault for Notesy, and Itsyhome for Pome home controls. Cameras use Apple Home through the Connector's bundled helper, rather than Itsyhome's control server. Hermes and OpenClaw are optional existing agents, not included agent installations.

Open Connector and choose an app in the sidebar. Follow its numbered Setup steps. Initial checks show Checking while they run. Red lights mean setup is incomplete or a completed check failed; Fix opens the relevant setup page. Green lights verify Mac connections, not a completed watch test.

## Notesy

1. Choose your Obsidian vault folder and confirm access in the folder picker. The Store app remembers this permission; it does not need access to your whole home folder.
2. Start Notesy on this Mac.
3. Start the private connection. If Tailscale requires HTTPS/Serve setup, complete its prompt and retry.
4. Select Connect phone and follow the pairing instructions in Pebble → Notesy → Settings. Save and refresh Notesy on your watch. Read a note and create a short test note to confirm both directions.

If the vault moved or access was revoked, choose it again. Existing pairing should be reused rather than reset.

## Beepster

1. Enable the connector and follow its setup steps for Beeper Desktop. Turn on Beeper's local API connection and create a dedicated token with the permissions requested by Beepster. Paste it into Connector's secure token field. Existing tokens are retained across app updates; a working connection does not need a replacement token.
2. Allow Contacts if you want contact names. If access was denied, adjust Connector's Contacts permission in System Settings → Privacy & Security and check again.
3. For Apple Messages attachments, choose Allow access. The folder picker opens at Messages Attachments; confirm that folder. If unavailable, use Command–Shift–G and enter `~/Library/Messages/Attachments`. Do not select your whole home folder. macOS may require additional protected-data consent. The running gateway checks the actual folder access.
4. Start the private connection, then use Connect phone to pair Beepster in its Pebble settings. Refresh a chat and open an attachment on the watch to verify those features.

The Store gateway runs with Connector and stops when Connector quits. Closing its window keeps the app running. It does not install the older DMG background LaunchAgent.

## Reminderz

1. Enable Reminderz and allow Reminders access when macOS asks. Existing reminders stay in Apple's Reminders store.
2. Start the private connection.
3. Use Connect phone, save the pairing details in Pebble → Reminderz → Settings, and refresh the watch app. Verify a temporary reminder before relying on watch edits.

If permission is denied, enable Reminders access for Connector in System Settings → Privacy & Security and check again.

## Pome home controls

1. Install/open Itsyhome and enable its Webhooks/CLI server. Keep Itsyhome running. In Connector's Pome page, save and check the service host and port. The defaults target Itsyhome on this Mac; enter the actual host for a different computer.
2. Start the private connection.
3. Copy the phone address into Pebble → Pome → Settings. Save, refresh Pome, and test a home control.

## Pome cameras

1. On a Mac running macOS 15.2 or newer, make sure your cameras are available to the Apple Home account on that Mac.
2. In Connector → Pome → Cameras, turn on Use cameras with Pome. Select Start camera connection and Allow Home access if needed. The helper is bundled with Connector; no separate developer camera app should be installed.
3. Select a camera. Choose On demand or a refresh interval; long intervals are preferable for battery-powered cameras. Hidden cameras are omitted and their local image history is cleared.
4. Use Capture now, then Show latest image. This produces still images; it is not a live-video watch stream.
5. Start the private camera connection. Copy camera address and Copy camera token into Pebble → Pome → Settings → Cameras, save, and refresh Cameras on the watch. **Camera pairing currently uses address plus token; it does not have a one-time pairing-code flow.** Keep the token private.

Closing the Connector window is designed to keep captures running. Quit is designed to stop the owned helper. The first public release must complete normal close/Quit/relaunch and physical-watch acceptance before these behaviors are marked verified. No special developer entitlements or manually installed development profile should be required by an App Store customer.

## Optional Hermes and OpenClaw

Ordinary Beepster messaging works without either agent. Link only the exact Telegram session belonging to the selected agent; a renamed display label does not create a new session.

The Store app does not install agent plugins or patch agent code. Install supported plugins through each agent's own supported installation workflow. Public plugin installation instructions and release assets must be finalized before optional-agent setup is advertised as ready.

- **Hermes:** the Store-compatible bridge requires plugin 0.5.1 or later and an authenticated loopback HTTP endpoint. Enter the bridge address and matching token under Hermes and save. Connector stores its token in Keychain. The agent supplies Telegram session choices, prompts and approval requests.
- **OpenClaw:** choose its data folder, then use Pair / manage OpenClaw access when required. Review the exact device request in OpenClaw; approval access does not require expanding the device to general administrative permissions. Thread prompt support additionally requires the external prompt plugin and its Store-file transport mode. A green approval-bridge light alone does not verify prompt injection.

Choose a session and its matching Telegram chat separately for each agent. Edit the supplied Pebble-focused thread prompt if desired. Saving instructions does not send a chat message or change the agent's global prompt. Test an actual linked conversation before relying on approvals from the watch.

## Daily use and troubleshooting

Use Settings to hide unused connectors, enable menu-bar mode/hide the Dock icon, or opt into start at login. Hiding an app preserves its settings and does not revoke permissions or stop its service. Tesla is hidden and marked Coming soon.

App Store updates are managed by Apple. Keep Tailscale connected on both devices. A private connection light checks the route from this Mac; refresh the watch to test the phone/watch path. If a port belongs to another service, select another supported private port rather than replacing that service's route.

For a migration from the DMG release, preserve existing pairing and avoid running both gateway owners. The prepared Switch from previous service action identifies the known older Beepster service and asks before stopping it and disabling its automatic launch. Unknown service owners are never stopped. This handoff still requires sandbox migration validation before release. Do not delete preferences, Keychain items or sandbox containers to fix a red light.

See [Privacy](PRIVACY.md) for local data, camera caching, permissions and third-party connections.
