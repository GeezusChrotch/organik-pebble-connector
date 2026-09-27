# Organik Apps Connector

The Mac connection for supported Organik apps on Pebble, Even G2 and Apple Watch.

**Upcoming GitHub edition: 1.0.1 (not yet published). Requires macOS 14 or later, on Apple silicon or Intel. Pome is not included.** The separate App Store edition retains Pome and Apple Home support; its availability is announced separately.

[Download and release notes](https://github.com/GeezusChrotch/organik-pebble-connector/releases/latest) · [Website and setup](https://organikapps.com/connector/) · [Privacy](PRIVACY.md)

Companion apps are installed separately. Availability varies by app and platform; a Connector entry does not mean its companion app has been publicly released. Pingsquatch was previously called Beepster, Calendry was DayFrame/Eventz, and Remindery was Reminderz. Existing technical identifiers and saved pairing are retained.

The instructions below describe the upcoming 1.0.1 release. The existing public download remains 1.0.0; some controls described here are newer.

## Set up in three steps

1. **Install on your Mac.** Open the DMG and drag Organik Apps Pebble Connector to Applications. Open that copy. The filename retains its original name for update compatibility; the window is titled Organik Apps Connector.
2. **Connect your Mac and phone privately.** Install and sign in to Tailscale on both using the same private network. Keep the Mac awake, online and running Connector whenever you use the connected features. No public port forwarding or Tailscale Funnel is needed.
3. **Choose your device and app.** Use the Pebble, Even G2 or Apple Watch button, then select an app in the sidebar. Follow its numbered setup steps. Choose Connect phone (or the app-specific iPhone connection button) for QR/code pairing, then finish setup in the companion phone app. You do not need Universal Clipboard: open the pairing page on the phone and copy the details there. Treat pairing details like a password.

## What each connection needs

- **Notesy:** select the local Markdown/Obsidian vault you want to use. Connector needs access to that folder; it does not require your whole disk.
- **Pingsquatch:** connect Beeper and its local API as shown in setup. Contacts access is optional for matching names. Messages attachments need the folder access shown in setup and may require macOS privacy approval. Hermes and OpenClaw links are optional and have separate setup.
- **Remindery:** allow Apple Reminders access to read and update your lists.
- **Calendry:** allow Calendar access to read events. It does not edit your calendars.
- **Even G2:** start the G2 connection, pair your phone and install the desired glasses app separately. Optional dictation has its own speech setup; local model downloads require your choice, and a custom provider has its own privacy and usage terms.
- **Apple Watch:** use the supported iPhone companion and its watch app. Connector supplies their private Mac connection; installing Connector does not install the iPhone or watch app.

Pome controls, cameras and pairing are unavailable in this GitHub edition. Tesla is an unreleased personal integration, hidden by default.

## Status and fixes

Overview shows a shared Tailscale check and app-specific requirements. When a check is red, use its adjacent **Fix** action and follow the permission request, folder chooser or service repair it opens. If it stays red after approval, return to Connector and recheck; read the specific error before changing other settings.

If your phone cannot connect, check Tailscale on **both** devices, confirm the Mac is awake, and verify that the app's service is running. Repeat phone pairing if its saved connection is stale. Hiding an app in Settings does not stop its service or remove its permissions.

For help, email [organikapps@icloud.com](mailto:organikapps@icloud.com) with the Connector version, platform, app name and exact error. Never send pairing codes, tokens, private messages or camera images.

## Updates and background operation

In Settings you can check for updates, set automatic checks from 1 to 168 hours, start at login, use the menu bar, hide the Dock icon and hide unused connectors. Closing the window keeps enabled services running; use Quit to exit Connector. The GitHub edition uses signed updates from GitHub. The App Store edition uses Apple's update system.

## Upgrade or change editions

1. Quit Connector before replacing the app in Applications. Keep one installed/running copy.
2. Preserve app data and Keychain entries. Do not use an uninstaller that deletes settings, and do not run a separate legacy connector alongside it.
3. Open the replacement and review its checks. macOS may ask for permissions again when the signing identity changes between GitHub and App Store editions. Re-select a folder or approve access when requested; this transition is not guaranteed to be prompt-free.

Saved pairing and settings are intended to be reused. If a service or permission needs attention, use its specific Fix action. Moving to GitHub removes access to Pome features; it does not make HomeKit available outside the Store edition.
