# Organik Apps Connector — direct download

For Notesy, Beepster, Reminderz and Eventz on Pebble, plus Beepster and DayFrame on Even G2. Requires macOS14 or later. Local Parakeet dictation requires Apple Silicon; Intel Macs can use a separately configured speech provider.

**Pome: Pome coming soon to the App Store.** This download does not include Apple Home controls or cameras for Pebble or Even G2. Existing Pome preferences are preserved, but Pome is unavailable in this edition.

1. Drag Organik Apps Pebble Connector to Applications and open it. Use one Connector installation at a time. Do not run alongside another Connector or an old standalone Beepster service.
2. Install Tailscale on your Mac and phone. Sign into the same account and connect both. Keep this Mac powered on, awake, connected to the internet and running Connector while using your watch/glasses. A sleeping or offline Mac cannot serve your apps.
3. Choose the apps you use in the sidebar or Even G2 tab. Follow the numbered setup steps. Beepster needs Beeper Desktop signed in with its local API enabled; Notesy needs a selected Obsidian vault; Reminderz and Eventz/DayFrame need the corresponding macOS permissions.
4. Copy pairing only from the relevant app's setup, paste into its Pebble or Even phone settings, and save. Refresh the app on your physical watch/glasses. A green Mac status light does not verify phone pairing or device delivery.

The shared Tailscale light reports this Mac's connection. App connection lights test each app's own private route. Tailscale must also be connected on the phone. No public Funnel is enabled.

Closing the window leaves services running. File → Open Connector (Command-O) reopens it. Quit stops Connector and its app-owned services, including Beepster. Beepster no longer requires a separate login service. Settings can enable menu-bar mode, start at login, and hide unused apps without erasing pairing.

Local dictation downloads public model assets during setup. A custom hosted speech provider receives audio and may charge separately. See Privacy for the exact data flows and optional services.

This is a Developer ID direct-distribution candidate. Publication, clean-install tests and device acceptance are tracked separately from signing and notarization.

## Switching editions

Both editions keep their services inside Connector and use the macOS sandbox. Pome is exclusive to the App Store edition; Eventz and DayFrame are included in both. macOS may ask you to authorize access again when changing from an Apple Development test build to the signed GitHub edition. Ordinary updates within the GitHub edition retain its signing identity and sandbox. Existing permissions must be checked after an edition change; the Connector does not bypass or reset macOS privacy controls.
