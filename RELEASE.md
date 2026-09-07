# Organik Apps Pebble Connector 0.8.0

## What’s new since 0.7.0

- Notesy 1.4.6 adds PDF previews: browse PDF attachments, open embedded PDFs and specific-page links, and move through labeled pages in either direction. Pages render as needed, including rotated pages. PDF attachments remain read-only; unreadable files show a clear fallback.
- Natural, High contrast and Original image appearance for Notesy photos/drawings/PDFs and Beepster photos. Conversion is local and preserves original attachments. Beepster handles macOS bitmap output with and without transparency.
- Beepster displays descriptive link labels or bare-link hostnames, with an optional Hide links setting. Link formatting does not fetch websites or change sent messages.
- Retains responsive background checks, separate agent linking, editable Pebble thread prompts, menu bar mode and signed update checks.

## Update instructions

Install Connector **0.8.0 first**, then the matching Notesy 1.4.6 and Beepster 0.18.0 watch updates. For an existing Beepster service, choose **Beepster → Set up service** after updating and reopen phone settings. Watch apps install separately. Existing pairing, vault selection, thread prompts and private routes are retained.

Requires macOS 14 or later; universal Intel/Apple silicon build with macOS 27 beta compatibility checks. Tesla stays hidden by default with Coming soon. PebClaw is excluded.

## Privacy

Images and PDF pages are converted locally; source attachments are preserved. Beepster link labels do not make website requests. Notesy’s existing bare-URL page-title requests remain subject to the limits in the included privacy guide.

## Validation

The release rebuilds the native PDF helper and verifies the frozen runtime and watch-package inputs. Notesy’s 91 tests and packaged PDF checks cover multi-page navigation, embeds, rotated pages, all image modes and unreadable files. Signing, notarization, downloaded checksums and the Sparkle feed are verified during publication.

Prior local test builds were installed and exercised. Publication does not replace the local test installation or claim fresh physical-watch acceptance.
