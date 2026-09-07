# Organik Apps Pebble Connector 0.8.1

## What’s new

Bundles Notesy 1.4.7 and its matching task-text gateway. Long task text continues across blocks and pages without truncating UTF-8 characters, while retaining one checkbox and the original task marker. The matching watch app sizes task rows for the selected font and refreshes the layout after theme changes.

## Update instructions

Install **Connector 0.8.1 before Notesy 1.4.7**. Watch installation is separate. Existing pairing, vault selection, thread prompts and private routes are preserved. Beepster and its managed service are unchanged from Connector 0.8.0.

If upgrading from before 0.8.0, its PDF previews and image appearance controls are included. Existing Beepster users upgrading from those earlier versions should choose **Beepster → Set up service**, then reopen phone settings.

Requires macOS 14 or later; universal Intel/Apple silicon build with macOS 27 beta compatibility checks. Tesla remains hidden by default and marked Coming soon. PebClaw is excluded.

## Validation

All 93 Notesy tests and two packaged task-text checks passed, covering long UTF-8 text, paging, a single checkbox, exact marker edits and font-based row heights. The local matching build was installed and accepted by the user. Publication does not reinstall the app or watch package. Signed/notarized assets, download checksums and the Sparkle feed are verified during publication.
