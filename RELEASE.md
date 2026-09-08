# Organik Apps Pebble Connector 0.8.7

## What’s new

- Beepster’s overview now includes **Full Disk Access for attachments**, checked by the running service. Setup opens the correct permission page and reveals the service to add; restart and recheck confirms access.
- Updated Beepster gateway supports reaction names, bounded GIF previews, and YouTube thumbnails, including clearer attachment permission errors.
- Includes Notesy 1.4.8 with full-width watch media.
- Background checks keep the interface responsive.

## Update instructions

Install **Connector 0.8.7 first**, then choose **Beepster → Set up service** to update its background gateway. Updating the app alone does not replace that service. Install the matching Beepster 0.20.0 watch update separately. Existing pairing, vault selection, thread prompts and private routes are retained.

For Apple Messages attachments, follow the attachment-access setup and choose **Restart and recheck**. Only confirmed service access turns the light green.

Requires macOS 14 or later; universal Intel/Apple silicon app. Tesla remains hidden by default. Pome’s existing Itsyhome connection is retained; no experimental camera helper is shipped.

## Validation

Native requirement tests cover denied, unknown, missing, ready and revoked attachment access. The installed gateway’s attachment check and a real Messages GIF succeeded locally. The Beepster owner reports 220 tests and clean package/privacy checks; Notesy reports 94 tests and both watch builds. Latest watch media layout has emulator coverage; final physical-watch acceptance remains pending. Publication does not replace the local app or install watch packages.
