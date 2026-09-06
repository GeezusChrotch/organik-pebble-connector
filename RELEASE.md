# Organik Apps Pebble Connector 0.4.4

## What’s new since 0.3.0

- Background refreshes keep the interface responsive: buttons and text fields remain available, current status stays visible while checking, and stale checks cannot replace newer action results.
- Service address edits are saved only when you choose **Save and check service**. A save during an active check queues a fresh check.
- Separate OpenClaw and Hermes linking sections show only sessions with Telegram routes. OpenClaw titles reflect sidebar names.
- Editable Pebble-focused defaults for each connected thread, with **Restore Pebble default** and an option to clear extra instructions. Existing custom prompts are preserved.
- Bundles Notesy 1.1.0. Watch installation remains a separate step.

## Updating

Use **Check for updates** in the Connector, or download the DMG and replace the app in Applications. Requires macOS 14 or newer; universal Intel/Apple silicon build, including macOS 27 beta compatibility checks. Pairing and preferences are preserved.

For thread instructions, install or update prompt support in the relevant agent section, then restart that agent when idle. Later edits apply on its next message. OpenClaw instructions apply to the exact linked session, including access outside Beeper; Hermes applies them to its linked Telegram session. Approval requirements remain unchanged.

## Validation

- Connector checks and all 160 gateway tests passed.
- Final app and DMG signed, notarized, and stapled; Gatekeeper accepted the app.
- 0.4.4 installed and launched locally; the preceding refresh fix received user confirmation.
- No new physical-watch installation or complete fresh-user walkthrough is claimed.

Download integrity is recorded in SHA256SUMS. The updater feed is signed with the existing Sparkle key.
