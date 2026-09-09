# Organik Apps Pebble Connector

One Mac app connects Notesy, Beepster, Reminderz, and Pome to your Pebble through your phone. Choose an app in the sidebar, follow its numbered setup, and use Overview to check connections. Optional features and troubleshooting are separate from the main setup.

**The next Mac App Store release is in preparation and is not publicly available yet.** The source on this branch includes the accepted direct HomeKit Pome backend and simplified setup. The older GitHub DMG release does not include this complete Store setup. Do not use its version number as proof of direct HomeKit support.

## Setup

Use macOS 14 or newer. Cameras require macOS 15.2 or newer. Install Tailscale on Mac and phone and connect both to the same account. Install the watch apps separately in the Pebble phone app.

Each app has three main steps:

1. **Connect its data source.** Notesy uses the Obsidian vault folder you choose and starts automatically. Beepster’s guided setup connects Beeper Desktop and requests Contacts access for names. Reminderz requests Apple Reminders access and starts sync. Pome connects directly to Apple Home through the bundled helper.
2. **Connect privately.** Start the private Tailscale connection so your phone can reach this Mac away from home. Existing matching routes are reused.
3. **Pair your phone.** Follow Connect phone for Notesy, Beepster, or Reminderz. For Pome, copy its URL and token into Pebble → Pome → Settings → Setup; home controls and cameras share that connection.

Pome requires no Itsyhome installation or external home-control server. Set up your home in Apple Home on this Mac first. Optional cameras, Beepster attachment access, and Hermes/OpenClaw links have their own setup sections. Agent setup is separate for each agent and uses only its Telegram sessions.

See the [complete Store setup guide](STORE-SETUP.md), [optional-agent guide](agents/README.md), and [privacy policy](PRIVACY.md).

## Daily use

Keep the Mac awake and Tailscale connected on both devices. Closing Connector’s window keeps its services running; quitting stops the owned services. Pome home controls continue when camera capture is paused. Settings can hide unused connectors, run Connector in the menu bar without a Dock icon, and enable start at login. Tesla is hidden by default and marked Coming soon.

Green lights verify the Mac connections. Use the watch to verify the complete phone/watch path. A red light opens the affected app’s setup through Fix. Background checks leave setup controls available.

## Building and release status

The [self-contained Xcode Cloud project](cloud/README.md) builds the Store app using a supported stable host and Apple-managed signing. [Accepted source hashes](cloud/ACCEPTED-SOURCE.json) pin the native and HomeKit source used by the tested development build. A Store archive has different build/signing metadata and must pass its own validation and review.

Developer build instructions for the older direct-distribution path remain in [BUILDING.md](BUILDING.md). Installing a development candidate, watch acceptance, App Store approval, and public release are separate steps. Historical tags retain older releases and documentation.
