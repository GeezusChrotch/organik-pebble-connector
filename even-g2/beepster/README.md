# Beepster for Even G2

Read Beeper conversations and send reviewed replies on the green G2 display. Version 0.1.18 is the latest personal Beta; public release is pending the compatible Connector download and final release checks.

## What you need

- Even G2 glasses paired with the Even phone app, with Beepster installed from its Even Hub listing when available.
- A Mac running the Organik Apps Pebble Connector and Beeper Desktop, signed into your messaging accounts. Beepster uses Beeper's connected services; it is not a standalone messaging service.
- An always-on, awake Mac. Connector and Beeper must keep running, including when you are away. A sleeping or shut-down Mac cannot serve chats or transcribe replies.
- Tailscale on both that Mac and the paired phone, connected to the same private network for remote access. No public port forwarding or Tailscale Funnel is needed.
- For voice replies, the Connector's Parakeet speech setup and model download, plus microphone permission in Even. Download models before relying on dictation away from home.

Download Connector from [the official GitHub releases page](https://github.com/GeezusChrotch/organik-pebble-connector/releases/latest). Use the compatible signed and notarized Mac download identified in the release notes. This GitHub download is separate from the Mac App Store version under review. Public Beepster release will wait until that compatible download is live.

## Pair once

1. Install Connector in Applications and open it. Finish Beepster's guided Beeper connection setup and authorize the requested Beeper access. Confirm its status is ready.
2. Connect Tailscale on the Mac and phone. In Connector's **Even G2** section, enable Beepster and choose **Copy pairing**.
3. Make that copied pairing available on the phone, for example with Universal Clipboard. Pairing contains a private access token: do not post it or include it in screenshots.
4. Open Beepster's settings in the Even phone app. Under **Setup → Connect to your Mac**, choose **Paste pairing from clipboard**, then **Save & apply**.
5. Choose **Check connection**. For voice replies, finish Connector's speech setup until the check also reports voice replies ready.
6. Open Beepster on the glasses. Test away-from-home access with the phone on cellular while Tailscale stays connected and the Mac stays awake.

## Read and reply

Beepster opens directly to the inbox. Pinned chats come first; other conversations are ordered by recent activity. Swipe to a conversation and tap to open it. Select **More conversations** to load further inbox entries.

Threads run oldest to newest and open at the newest end. Sender, time and message share the same paragraph, divided by middots. Service icons identify the messaging service. Thin lines separate messages without blank spacer rows.

Swipes advance between messages. A message that fits on one screen stays whole; if it will not fit in the remaining space, it waits for the next viewport. A message taller than a screen scrolls one line at a time within itself. Swipe above loaded history to request older messages.

Tap to open attachments belonging to the visible messages. One attachment opens directly; multiple attachments show a chooser. Double tap returns to the thread at the same reading position. GIFs are manual flipbooks, and videos/YouTube links show available thumbnails, not video playback.

Long press opens the system menu: **Quick reply, Dictate, Pin / unpin, Archive, Refresh**, followed by the G2 system controls for brightness, display off and closing. Replies and dictation live in that menu. Select a text or emoji quick reply and confirm it. For dictation, speak, tap to finish, review the transcript and choose Send. Double tap cancels recording. Transcription never sends automatically. If delivery is uncertain, check Beeper before retrying.

Incoming reactions appear on the original message. Emoji quick replies are new messages, not reactions. Explicitly merged Beeper conversations combine their member histories; replies use the default reply service configured in Beeper. Beepster does not guess merges from matching contact names.

Double tap goes back. At the inbox, the app's quit confirmation defaults to **No, stay**.

## Phone settings

All app settings are on the phone, in **Setup**, **Pinned chats** and **Replies**. Use checkboxes, selectors, preset buttons, emoji pickers and ordering controls, then **Save & apply**.

- Setup: included services, refresh interval, links, image appearance, sender names, timestamps, read receipts, photo/GIF previews, text width and transcription language.
- Pinned chats: drag or use arrows to order conversations pinned from the glasses menu.
- Replies: choose and order up to eight text replies and 15 emoji replies. Existing saved custom replies are retained.

Refresh defaults to every 15 seconds while the app is active; choose 5, 15, 30 or 60 seconds, or manual. Polling pauses during dictation, reply review, sending, the system overlay and app exit. Read receipts are off by default; when enabled, only visible messages are marked read. There are no closed-app push notifications.

## Attachments and troubleshooting

Photos and thumbnails are adapted to green grayscale. GIFs use a limited set of frames. Preview quality depends on the available Beeper/gateway source, not the original attachment's full resolution. Unsupported files remain text entries; audio and video playback are not supported.

Some Apple Messages attachments require additional Mac access. Use Connector's media-access repair flow and authorize the requested access for the installed Connector. A missing or not-yet-downloaded attachment is different from denied access; download it in its source app before retrying. Keep Connector in Applications so permissions stay associated with the installed app.

If connection checks fail, confirm that the Mac is awake, Connector and Beeper are running, both Tailscale clients are connected, and the saved pairing belongs to this Connector. For dictation, verify Connector's speech status and Even microphone permission. Do not repeatedly resend a reply to diagnose a connection.

## Development and validation

Run `npm test`, `npm run build` and `npm run pack` from this directory. Demo mode (`npm run dev -- --host 127.0.0.1 --port 5189`, then `http://127.0.0.1:5189/?demo=1`) uses synthetic data and cannot send to real Beeper chats.

Version 0.1.18 has 80 passing tests and recorded personal Beta publication. See `CANDIDATE-0.1.18.json` for exact artifact identity and `release/0.1.18/` for public-release preparation. Physical glasses acceptance is still pending; package, tests and simulator images do not prove hardware behavior. Connector builds and deployment are owned by the Connector release task; the old app-local test build script is not the public distribution workflow.
