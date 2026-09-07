# Organik Apps Pebble Connector 0.8.2

## What’s new

Adds 26-pixel emoji atlas support for Beepster 0.19.0. The matching watch update provides larger service icons, chat emojis and quick-reply emojis, plus a clearer sender stripe. Notesy 1.4.7, complete task text, PDF previews and image appearance controls are retained.

## Update instructions

Install **Connector 0.8.2 first**, choose **Beepster → Set up service**, then reopen phone settings and install Beepster 0.19.0. Updating the app alone does not replace the existing managed Beepster service. Watch installation is separate. Pairing, vault selection, thread prompts and private routes are preserved.

Requires macOS 14 or later; universal Intel/Apple silicon app, with macOS 27 beta compatibility checks. Tesla stays hidden by default and marked Coming soon. PebClaw is excluded.

## Validation

The accepted local build passed signature and platform checks. Its running authenticated gateway rendered 15 emojis at 26 pixels in a 130×78 atlas with the expected pixel count. The Beepster owner reports 199 tests and watch builds passed, followed by successful watch installation and user visual acceptance. Publication does not reinstall the app or watch package. Signing, notarization, downloaded checksums and Sparkle signatures are verified during publication.
