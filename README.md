# Organik Apps Pebble Connector

One Mac app for **Notesy, Beepster, Reminderz, and Pome**. Version 0.8.7 requires macOS 14 or newer.

Drag the app into Applications and open it. Use the sidebar to select an app. Each connector has the same three sections: **Setup**, **Requirements**, and **Troubleshooting**. Follow the numbered Setup steps from top to bottom, then use Check connection to refresh its requirements.

## Overview

The overview shows green and red lights for each visible app’s requirements. Green means the requirement passed; red means it needs attention or has not been checked. Hover over a requirement for details. **Fix** opens that connector’s setup page and appears only when a requirement is red. Use the sidebar for other navigation.

The Private connection light checks that the configured HTTPS route reaches the service from this Mac. It is separate from phone verification.

Only automatically checked Mac requirements affect the lights. A phone that has not connected since startup is not a failed requirement. Notesy shows its last phone contact as information in its Setup section. Refresh each app on the watch after setup to confirm end-to-end operation; no confirmation checkbox is required.

## Settings

- **Visible connectors:** hide apps you do not use from the sidebar and overview. Hiding preserves pairing, preferences, and any running service. Use the connector’s Troubleshooting controls to stop a hosted service before hiding it if you want to stop sync.
- **Tesla — Coming soon:** hidden by default. The optional page manages an existing personal Tesla gateway; it does not install a gateway or perform Tesla developer enrollment. It is included in the same app download.
- **Connector updates:** check manually, or turn on automatic checks and choose an interval from 1 to 168 hours. Checks run while the connector is open, including with its window closed. You approve downloading and installing each update. Watch apps are updated separately.
- **Menu bar mode:** Settings → Appearance can hide the Dock icon and keep a menu bar shortcut to the Connector. Your choice is remembered.
- **Start at login:** opens the connector when you sign into your Mac. macOS may ask you to allow it in System Settings → General → Login Items.

PebClaw has been removed from this connector.

## Connect your apps

### Notesy

Choose your Obsidian vault, start the service, then start the private connection. **Connect phone** shows a one-time QR code. Scan it, get the pairing details, then paste them into Pebble → Notesy → Settings on your phone. Test and save. Open Notesy on your watch to confirm it connects. The watch package is available from the app menu.

Notesy offers Quick Dictate for one short thought and Stitch for longer notes, including append. Pebble dictation is limited to 15-second sections; Stitch saves each accepted section before starting the next. Back stops the sequence.

Your vault remains on your Mac. Dictated notes, browsing, pending drafts, and pairing keep their existing behavior. See the [Notesy guide](https://github.com/GeezusChrotch/notesy#readme) for watch controls and supported content.

### Beepster

Keep Beeper Desktop open. Select **Enable Beepster**, then follow the numbered steps and select **Set up service**. The guided flow installs or repairs the service, helps you obtain the Beeper Desktop API token, enables Contacts access, and starts the private connection. Select **Connect phone**, save the details in Pebble → Beepster → Settings, and refresh your watch.

Opening Beeper Desktop, setting its token, allowing Contacts, and pairing are visible setup steps. Troubleshooting offers service and route repairs and Contacts privacy settings. OpenClaw and Hermes approvals are optional and do not affect the required lights. In the optional agent setup section, pair OpenClaw access or install the Hermes bridge, then link an agent session to its matching Telegram chat. Review the displayed confirmation before installation or linking. Restart Hermes when idle if requested. Connection checks do not prove watch delivery; test an approval from your own session.

### Reminderz

Select **Enable Reminderz**, allow Reminders access, start the private connection, and connect your phone. Scan the one-time code and copy its details into Pebble → Reminderz → Settings. Save, refresh the watch.

If the service will not start, stop and quit the standalone Reminderz Connector first. Only one app can own its listener. If Keychain access was dismissed, use **Troubleshooting → Unlock Keychain** to retry.

### Pome

Keep Itsyhome installed and running with its Webhooks/CLI server enabled. Enter the service host and port in Setup step 1, then select **Save and check service**. Start the private connection and copy the phone address into Pome’s Pebble settings. Save, refresh your watch.

## Moving from older connectors

Keep your existing phone settings and pairing. You normally do not need to reinstall a watch app solely to change Mac connectors.

- **Beepster:** enable it here and check the connection. Its existing background service is reused; enabling the page does not reinstall or restart it. Once ready, quit the old connector window. Keep Beeper Desktop and Tailscale running.
- **Reminderz:** in the old connector, turn off Start at Login, stop the service, and quit. Enable Reminderz here and approve Keychain and Reminders access if requested. Check the connection, restore its private route if needed, then refresh your watch. Enable startup in this app’s Settings if desired.
- **Pome:** keep Itsyhome running and enter its existing host and port. Matching private routes are reused.
- **Previous personal edition:** install this same unified app. Notesy, Beepster, and Reminderz preferences are retained. Tesla is hidden until enabled in Settings. PebClaw is no longer hosted here; an independently running relay is not uninstalled.

Keep the older app available until a watch refresh succeeds. To roll back, quit this connector and reopen the previous app. For Reminderz, restart its service and restore its startup preference if needed.

## When a connection needs attention

Keep the Mac awake and signed into Tailscale, and connect the phone to the same Tailscale network. Open the app’s page with **Fix**, read the red requirement’s explanation, follow Setup, and run **Check connection**. Troubleshooting contains the individual repair controls.

Existing private routes are reused. A port belonging to another service is preserved. Closing the window keeps enabled services running; quitting stops Notesy and Reminderz hosted by this app. Beepster’s background service and independently running Itsyhome/Tesla gateways continue separately.

[Privacy](PRIVACY.md) · [Source and releases](https://github.com/GeezusChrotch/organik-pebble-connector)

## Acknowledgments

Thank you to the upstream apps, developers, communities, and tools that made this possible. See [Acknowledgments](ACKNOWLEDGMENTS.md), also available from the app menu.

In Settings → Appearance, enable “Run in the menu bar and hide the Dock icon” to keep the Connector in the menu bar. The menu can reopen the window, open Settings, check connections or updates, and quit. Turn the option off to restore the Dock icon. Closing the window keeps services running.

Choose an app in the sidebar and follow its numbered Setup steps: prepare the source app or vault, grant required access, start the private connection, then pair your phone. Setup actions remain visible; Requirements shows current health, and Troubleshooting contains recovery actions.

Thread prompts: in Beepster → agent connections, each enabled saved link has Edit thread prompt. These are additional system instructions for the exact linked session, preserving the base prompt. Install OpenClaw thread prompt support or update the Hermes bridge (0.4.0), then restart that agent when idle. Later prompt edits apply on the next message; clear and save to remove them. Disabled or relinked sessions do not receive old prompts. OpenClaw-only sessions are shown with their current sidebar titles but cannot be linked to unrelated Telegram conversations.

OpenClaw and Hermes have separate session pickers, Telegram chat selections, and saved links inside their own setup sections. Each session picker shows only that provider.

## Changes in 0.4.4

Background connection checks keep buttons, fields, and thread prompt editors available. Explicit setup and save actions still prevent duplicate submissions. Service address fields are saved only with **Save and check service**.

OpenClaw and Hermes have separate linking sections, each listing only sessions with a Telegram route. OpenClaw session names follow its current sidebar titles.

Each enabled linked thread starts with editable Pebble-focused instructions: concise replies, simple formatting, and clear action confirmations. Use **Edit thread prompt** to customize them, **Restore Pebble default** to reset the editor, or clear and save to disable additional instructions. Existing custom prompts are preserved.

Install or update prompt support using the agent's setup controls, then restart that agent when idle. Later prompt edits apply on its next message. OpenClaw instructions follow the linked session even when opened outside Beeper; Hermes applies them to the linked Telegram session. Other sessions and normal approval requirements remain unchanged.

## Changes in 0.5.0

Includes the Notesy 1.2.0 gateway and watch package. Notesy can sort by name, modified date, created date, or tag; browse scoped tags; page in both directions; and use Return to top. Update the Connector before installing Notesy 1.2.0 on the watch, since its new sorting requests require the matching gateway. Older Notesy clients remain supported.

Updated Reminderz watch paging works with the existing unified service; no new pairing is needed. Watch apps install separately from Connector updates.

## Changes in 0.7.0

Includes Notesy 1.4.4 and the matching gateway for note links, a scrolling document reader, inline Markdown/HTML formatting, preserved line breaks, and corrected strikethrough. Unsupported HTML/CSS falls back to the watch theme. New style combinations require both this Connector and the matching Notesy watch app. Install the Connector first.

Bare web URLs may request a public page title; named links use their label. See [Privacy](PRIVACY.md) for the request limits and data involved.

Beepster’s phone settings include Double Back and Main Top. Fresh defaults in both views are top hold Quick reply, middle hold Dictate, bottom hold Delete, and Double Back Main Top; chat middle press defaults to No action. Existing custom bindings are preserved. Button scrolling is fixed at one line; the old distance setting is removed. After updating the Connector, use **Beepster → Set up service** to refresh an existing separately managed Beepster service, then reopen Beepster’s phone settings.

Watch apps are installed separately. This release does not change Tesla’s hidden-by-default Coming soon status or reintroduce PebClaw.


## Changes in 0.8.0

Includes Notesy 1.4.6 with local PDF page previews, browsable PDF attachments, embedded PDFs and specific-page links. Pages render on demand, with page labels and navigation in both directions. Rotated pages are supported; unreadable PDFs show an explanation. PDF attachments remain read-only.

Notesy and Beepster offer Natural, High contrast and Original image appearance in phone settings. Conversion runs locally on the Mac and preserves original attachments. Beepster also displays descriptive link labels or bare-link hostnames, with an optional Hide links setting; it does not fetch linked pages to create these labels.

Update to Connector 0.8.0 before installing the matching watch updates. For an existing Beepster service, choose **Beepster → Set up service** after updating, then reopen phone settings. Watch installation is separate. Existing pairing, vault selection, thread prompts and private routes are retained.


## Changes in 0.8.1

Includes Notesy 1.4.7 with complete long task text. Long tasks continue across reader blocks and pages while retaining one checkbox; checking a task changes only its original marker. The matching watch app measures task rows using the selected font and available width, and refreshes the layout after a theme change. Update Connector before installing Notesy 1.4.7. Existing settings and attachments are preserved; Beepster is unchanged.


## Changes in 0.8.2

Supports the larger emoji previews in Beepster 0.19.0, including 26-pixel quick-reply emojis. The matching watch update also enlarges service icons and chat emojis and uses a clearer sender stripe. Install Connector 0.8.2, choose **Beepster → Set up service**, then reopen phone settings and install the matching watch update. Notesy 1.4.7 and its task-text fix are retained.

## Changes in 0.8.7

Beepster now checks **Full Disk Access for attachments** in the overview. For Apple Messages photos and GIFs, use **Allow attachment access**, add the selected Beepster service to Full Disk Access, then choose **Restart and recheck**. Checks run in the background.

Includes the Beepster 0.20.0 gateway for reaction names, GIF previews and YouTube thumbnails, plus the Notesy 1.4.8 watch package. After updating, choose **Beepster → Set up service** to install the bundled gateway; replacing the Mac app alone does not update that service. Watch updates are separate.

Pome continues to connect to Itsyhome. This release does not install or enable a HomeKit camera helper.
