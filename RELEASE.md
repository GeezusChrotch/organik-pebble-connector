# Organik Apps Pebble Connector 0.7.0

## What’s new since 0.5.0

- Bundles Notesy 1.4.4 with the matching note-link, document-reader and formatting gateway. Inline HTML is treated as text and supported styles; line breaks no longer collide with style markers or cause accidental strikethrough.
- Faster paging of link-heavy notes, with bounded parsing caches and fewer index writes.
- Web-page titles for bare public URLs, with bounded requests and hostname fallback. Named links use their labels without a request. The privacy guide is included inside the app and installer.
- Updated Beepster 0.17.0 phone controls: Double Back/Main Top, revised hold defaults, chat middle press No action, and fixed one-line button scrolling. Existing custom assignments are preserved.
- Retains responsive background refreshes, editable Pebble thread prompts, menu bar mode and signed update checks.

## Update instructions

Update the Connector before installing Notesy 1.4.4; its formatting requires this gateway generation. Watch apps install separately. For an existing managed Beepster service, choose **Beepster → Set up service** after updating, then reopen the phone settings to load the new controls. Existing pairing, vault selection and private routes are retained.

Requires macOS 14 or later; universal Intel/Apple silicon build with macOS 27 beta compatibility checks. One build; Tesla remains hidden by default and marked Coming soon. PebClaw is excluded.

## Privacy

For an unlabeled public web URL, Notesy may request the page to obtain its title. The website receives the URL request and Mac’s public IP. No cookies, credentials, note body, referrer or scripts are sent/run. Private addresses are excluded; redirects are checked, with a 2.5-second/128 KiB limit. Details are in PRIVACY.md.

## Validation

Connector compilation, platform, packaging and privacy checks pass. All 84 Notesy tests passed with the bundled image helper. Immutable source and watch-package inputs were verified. Signed/notarized artifacts and the Sparkle feed are verified before publication, followed by downloaded-asset checksum verification.

Prior test builds were installed and tested; this uniquely versioned release has not replaced the local test installation. The latest watch package and new Beepster defaults are not claimed as newly hardware-tested by this Connector release.
