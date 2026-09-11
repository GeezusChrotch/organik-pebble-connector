# Organik Apps Pebble Connector 1.0 — Mac App Store setup

**Prerelease guide. The App Store version is not publicly available yet.** This guide describes the next Store candidate with direct HomeKit Pome; it includes the build 57 Apple-review fixes and latest Pome G2 support. The older DMG release has different update and background-service behavior.

## Before you start

Use macOS 14 or newer; Pome cameras require macOS 15.2 or newer. Install the Pebble apps you want separately in the Pebble phone app. Install Tailscale on the Mac and phone, sign into the same account, and connect both. Keep the Mac awake and the Connector running when using your watch away from the Mac.

Only install each app's prerequisites if you use it: Beeper Desktop for Beepster, an Obsidian vault for Notesy, and an Apple Home configured on this Mac for Pome. Home controls and cameras share the Connector’s bundled HomeKit helper; no additional home-control app is required. Hermes and OpenClaw are optional existing agents, not included agent installations.

Open Connector and choose an app in the sidebar. Follow its numbered Setup steps. Initial checks show Checking while they run. One shared Tailscale light covers this Mac’s connection; each App connection light checks that app’s own private route. A shared outage is shown once. Red lights mean setup is incomplete or a completed check failed; Fix opens the relevant setup page. Green lights verify Mac connections, not a completed watch test.

## Notesy

1. Choose your Obsidian vault folder and confirm access in the folder picker. The Store app remembers this permission; it does not need access to your whole home folder.
   Notesy starts its Mac service automatically after you choose the folder.
2. Start the private connection. If Tailscale requires HTTPS/Serve setup, complete its prompt and retry.
3. Select Connect phone and follow the pairing instructions in Pebble → Notesy → Settings. Save and refresh Notesy on your watch. Read a note and create a short test note to confirm both directions.

If the vault moved or access was revoked, choose it again. Existing pairing should be reused rather than reset.

## Beepster

1. **Connect Beeper Desktop.** Sign in to Beeper, enable its Desktop API, and create a dedicated Beepster token. Choose Connect Beeper in Connector: its assistant asks for the token if needed, explains optional Contacts matching and delivery of matched names to your paired phone/watch; choose Continue or Not Now before the system Contacts prompt, and starts the gateway. Existing credentials are reused.
2. **Connect privately.** Install/connect Tailscale on Mac and phone so your watch can reach Beepster away from home. The assistant creates this route when Tailscale is ready; otherwise choose Start private connection.
3. **Pair your phone.** Choose Connect phone, save the pairing details in Pebble → Beepster → Settings, and refresh a chat on the watch.

Optional Apple Messages photos/GIFs are under their own disclosure. Choose Allow attachment access and select `~/Library/Messages/Attachments`; this allows the running gateway to read those protected files. macOS may require additional privacy consent. Retry and restart actions are in Troubleshooting. Optional Hermes/OpenClaw setup is separate from ordinary messaging.

The Store gateway runs with Connector and stops when Connector quits. Closing its window keeps the app running. It does not install the older DMG background LaunchAgent.

## Reminderz

1. Choose Continue in Reminders setup, then decide whether to grant access in the macOS permission dialog. Existing reminders stay in Apple's Reminders store.
2. Start the private connection.
3. Use Connect phone, save the pairing details in Pebble → Reminderz → Settings, and refresh the watch app. Verify a temporary reminder before relying on watch edits.

If permission is denied, enable Reminders access for Connector in System Settings → Privacy & Security and check again.

## Eventz

1. Choose Continue in Calendar setup. The macOS permission dialog lets you decide whether Connector can read calendars and events. Eventz does not change events.
2. Start its private connection so the phone can reach this Mac.
3. Choose Connect phone and save the pairing details in Eventz’s Pebble settings. Refresh the watch and verify an event.

## Pome — Apple Home

1. **Connect Apple Home.** Set up your home in Apple Home on this Mac, then choose Connect Apple Home in Connector. This starts the bundled helper and requests permission to read your home and control accessories. There is no Itsyhome dependency or separate home-control server to configure.
2. **Connect privately.** Start the private connection so the phone can reach this Mac through Tailscale. Home controls and cameras share the same route.
3. **Pair your phone.** Copy Pome URL and Pome token into Pebble → Pome → Settings → Setup. Choose favorite scenes, save, and refresh Pome. Existing camera pairing is reused for home controls. Keep the token private; Pome currently uses URL/token pairing rather than a one-time pairing code.

Under **Optional: Cameras**, enable cameras, choose a camera, and set On demand or a refresh interval. Longer intervals suit battery cameras. Use Capture now to check a still image. There is no separate camera pairing step. Pausing cameras keeps home controls connected. Closing Connector’s window keeps its service running; normal Quit stops it.

Pome’s direct HomeKit connection is the default for the next release. The signed development candidate has passed local/private HomeKit inventory and window-close/Quit/reopen checks; physical-watch acceptance and Store distribution remain separate release gates.

## Pome for Even G2

1. In Pome, select Even G2 and connect Apple Home. It shares the existing HomeKit helper; no second Connector build is needed.
2. Start the G2 connection with Tailscale connected on Mac and phone. Copy pairing into Pome’s settings in the Even phone app. The G2 route and credential are separate from Pebble pairing.
3. On Apple Silicon, first setup prepares free local Parakeet dictation by downloading public model files. Audio is transcribed on the Mac; temporary audio is deleted after processing. Intel Macs need a custom speech provider for dictation. A custom hosted provider receives audio under its own policy and may charge for usage.
4. Open Pome on the glasses. Verify navigation, a fresh camera image and dictation; review the proposed home action before confirming it. Mac health checks do not replace physical glasses tests. Basic microphone, camera and room controls have been user-tested; newer menu and dictation UX remains a separate acceptance check.

## Optional Hermes and OpenClaw

Ordinary Beepster messaging works without either agent. Link only the exact Telegram session belonging to the selected agent; a renamed display label does not create a new session.

The Store app does not install agent plugins or patch agent code. Install supported plugins through each agent's own supported installation workflow. Use the [pinned optional-agent installation guide](agents/README.md) for the supported CLI commands, environment setup and source hashes. Clean-account installation and live prompt/approval acceptance remain release gates.

- **Hermes:** the Store-compatible bridge requires plugin 0.5.1 or later and an authenticated loopback HTTP endpoint. Enter the bridge address and matching token under Hermes and save. Connector stores its token in Keychain. The agent supplies Telegram session choices, prompts and approval requests.
- **OpenClaw:** choose its data folder, then use Pair / manage OpenClaw access when required. Review the exact device request in OpenClaw; approval access does not require expanding the device to general administrative permissions. Thread prompt support additionally requires the external prompt plugin and its Store-file transport mode. A green approval-bridge light alone does not verify prompt injection.

Choose a session and its matching Telegram chat separately for each agent. Edit the supplied Pebble-focused thread prompt if desired. Saving instructions does not send a chat message or change the agent's global prompt. Test an actual linked conversation before relying on approvals from the watch.

## Daily use and troubleshooting

Close the main window without stopping services. Choose File → Open Connector (Command-O) to reopen it. Quit stops the app and its owned services.

Use Settings to hide unused connectors, enable menu-bar mode/hide the Dock icon, or opt into start at login. Hiding an app preserves its settings and does not revoke permissions or stop its service. Tesla is hidden and marked Coming soon.

App Store updates are managed by Apple. Keep Tailscale connected on both devices. A private connection light checks the route from this Mac; refresh the watch to test the phone/watch path. If a port belongs to another service, select another supported private port rather than replacing that service's route.

For a migration from the DMG release, preserve existing pairing and avoid running both gateway owners. The prepared Switch from previous service action identifies the known older Beepster service and asks before stopping it and disabling its automatic launch. Unknown service owners are never stopped. This handoff still requires sandbox migration validation before release. Do not delete preferences, Keychain items or sandbox containers to fix a red light.

See [Privacy](PRIVACY.md) for local data, camera caching, permissions and third-party connections.
