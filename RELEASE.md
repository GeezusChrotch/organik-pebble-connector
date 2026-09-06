# Organik Apps Pebble Connector 0.5.0

## What’s new

- Bundles Notesy 1.2.0 and its matching gateway: sort by name, modified date, created date, or tag; browse scoped tags; page both ways; and return to the top.
- Keeps the legacy Notesy browse API for older clients.
- Supports the updated Reminderz watch paging through the existing service API.
- Retains responsive background checks, separate agent linking, editable Pebble thread prompts, menu bar mode, and configurable update checks from 0.4.4.

## Updating

Use **Check for updates** in the Connector, or replace the app in Applications from the DMG. Install this Connector before Notesy 1.2.0 on the watch. Watch apps update separately; the Notesy PBW is included as a release asset. Existing vault selection, pairing credentials, and private routes are preserved.

Requires macOS 14 or later; universal Intel/Apple silicon build, with macOS 27 beta compatibility checks. One build serves all users. Tesla stays hidden by default and marked Coming soon; PebClaw remains excluded.

## Validation

The exact application was installed as 0.5.0 build 12. Connector checks and all 58 Notesy tests passed. Authenticated live checks passed for all four Notesy sort modes, tags, legacy browse, and Reminderz full-list responses. Credentials and private-route configuration were verified unchanged.

Notesy and Reminderz watch installations reported success, and the user confirmed the updates looked good. This is not a complete fresh-user walkthrough or exhaustive hardware acceptance test.

The app and installer are signed, notarized, and stapled. SHA256SUMS covers the final downloads; the Sparkle updater uses the existing signing key.
