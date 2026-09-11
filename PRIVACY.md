# Privacy

Organik Apps Pebble Connector runs on your Mac. It does not create an Organik Apps account or upload your notes, reminders, messages, or vehicle data to an Organik Apps server.

Each connector uses its own permissions and pairing. Notesy reads the Obsidian vault you select and runs its local rendering service on the Mac. Reminderz uses macOS Reminders access. Beepster uses your separately configured Beeper Desktop API connection and optional read-only Contacts access. Pome uses the bundled HomeKit helper for Apple Home controls and optional cameras. It reads home, room, accessory and scene information locally and performs the home actions you request. The optional Tesla page connects to your existing personal gateway.

Optional OpenClaw and Hermes integration can deliver approval requests through Beepster to the Telegram chat you explicitly link. Setup may discover local agent sessions and read chat names from your configured Beeper connection. In the Mac App Store build, you install optional agent plugins through the agent itself; Connector does not install or patch external executable code. It connects to an authenticated local Hermes HTTP bridge and uses a folder you explicitly select for OpenClaw session metadata and prompt settings. The separately distributed DMG build can offer explicit local plugin installation. Pairing and chat linking require an action in setup. Approval contents and your decisions are handled by the linked agent and messaging services. These integrations are not required for ordinary messaging.

Beeper, Notesy, Reminders and optional Hermes credentials are stored through macOS Keychain. The camera helper stores its camera connection credential locally and shares it with Connector through their entitled App Group. Camera and agent credentials can remain in process memory while used. Vault bookmarks, endpoint preferences, and visibility choices are stored locally. Hiding a connector does not revoke permissions, erase data, or stop its service. You can change system permissions in System Settings → Privacy & Security.

Private connections use Tailscale. The connector does not enable Tailscale Funnel. Matching routes are reused, and routes assigned to other services are preserved. Your use of Beeper, Tailscale, Tesla, and Apple services is also subject to their own privacy policies.

The Mac App Store build receives updates through Apple and does not include Sparkle. In the separately distributed DMG build, update checks contact the configured GitHub release feed through Sparkle; GitHub receives normal network request information such as your IP address. Sparkle profile submission is disabled and automatic checks can be disabled or scheduled in Settings. Signing keys used to publish releases are not included in the app.

The connector does not include analytics or advertising. A local ConnectionStatus.json file records requirement states and route-check error codes for troubleshooting. It contains no credentials, note content, private addresses, or vault paths, and is not uploaded. To share a problem report, remove tokens, pairing codes, private addresses, and personal content before posting it.

Optional thread system instructions are stored locally in Beepster/thread-prompts.json with owner-only file permissions and backups. In Store mode, Connector sends the enabled Hermes prompt rows over the authenticated local bridge and writes an OpenClaw prompt snapshot within the explicitly selected agent folder. The OpenClaw plugin and Hermes bridge apply only the instructions matching the exact enabled session/chat link. The OpenClaw plugin requires conversation-hook and prompt-injection permission; the Hermes bridge adds ephemeral system context. Saving does not send a message, restart an agent, or modify its global prompt.

## Optional Contacts access for Beepster

With your permission, Beepster reads names, phone numbers and email addresses from Contacts on this Mac to match participants in your existing Beeper conversations. Matching happens locally. The helper returns only matching names and an opaque contact-group identifier to the local gateway; it does not export your entire address book. The gateway keeps lookup results in memory. Matched conversation and sender names, and the opaque grouping identifier used to combine conversations, are included in authenticated responses sent to your paired phone and Pebble watch through your private connection. Therefore contact-derived information does leave the Mac for your own devices; it is not uploaded to an Organik Apps server. Tailscale transports that private connection, and Beeper separately handles messaging under its own privacy policy. Access is optional: without it, Beepster uses labels supplied by Beeper. You can deny the macOS prompt or revoke access in System Settings → Privacy & Security → Contacts.

## Notesy web-page titles

When a displayed note contains a bare HTTP(S) URL without a descriptive label,
the Connector requests that public web page directly to read its HTML title. The
website receives the URL request and the Mac's public IP address. Notesy sends no
note body, cookies, login credentials or referrer, and runs no page scripts. Named
links use their existing label without a request. Private/local addresses and
unusual ports are excluded. Requests have a 2.5-second deadline and a 128 KiB read
limit; redirects are rechecked. Up to 256 titles remain in memory for one day
(failures for 15 minutes). If a title cannot be obtained, Notesy shows the hostname.
The Markdown file is not changed. This page-metadata request is separate from the
local image renderer, which still does not fetch Internet images.


## Image appearance and PDF previews

Natural, High contrast and Original change only the watch preview. Notesy reads images, drawings and PDFs from the selected local vault and renders requested PDF pages locally with macOS. Source files are not edited or uploaded to a conversion service. Temporary rendering files are removed after conversion; a bounded in-memory preview cache avoids repeated work. Beepster retrieves requested attachments through the existing Beeper connection and converts previews locally. Image appearance is included in preview requests and cache selection.

Beepster link labels and Hide links are display preferences. Descriptive labels or bare-link hostnames are derived from message text without fetching the linked website. They do not alter sent messages. Notesy web-page title requests described above remain a separate feature.

## Beepster attachments and thumbnails

In the Mac App Store build, you explicitly select the Messages Attachments folder. Connector remembers a read-only security-scoped bookmark and passes access to its owned gateway. macOS privacy protections can still require additional consent. The DMG build uses its managed service and may require Full Disk Access. The status probe only opens and closes the local attachment directory; it does not enumerate messages or read attachment contents. Preview requests read the selected attachment and convert it locally. GIF previews use a bounded decoder.

For recognized YouTube links, Beepster may request a thumbnail directly from YouTube’s image host (i.ytimg.com). That host receives the video ID and normal request information, including your IP address; Beepster does not send message bodies or Beeper credentials. Reaction names come from the configured Beeper connection.

## Pome cameras

Cameras are optional and require Home access. The bundled helper discovers the cameras available to your Apple Home account. Scheduled captures request HomeKit snapshots. A manual capture can briefly open a muted HomeKit camera stream and capture the helper's own offscreen camera-rendering surface to obtain a fresh still image. This is not general desktop recording; the camera feature does not capture other apps or record audio. Images are converted locally for the watch.

The helper retains the nine newest successful images per camera in memory, together with capture timestamps and status. Hiding a camera clears its image history. Camera refresh schedules and the connection credential are stored locally. Pausing stops new captures; quitting Connector is intended to stop its owned camera helper. Closing the main window keeps enabled services running.

When configured, camera images travel through your private Tailscale connection to Pome on your phone/watch. They are not uploaded to an Organik Apps server. The camera address and credential authorize image access and should not be shared publicly. The helper's additional per-launch shutdown credential is shared only through the App Group and is never included in phone pairing. Apple Home and Tailscale also apply their own privacy policies.

## Store sandbox and local services

The Store build runs its bundled gateway as a child of Connector, rather than installing a background LaunchAgent. Notesy vault and attachment access use folders you select and locally stored security-scoped bookmarks. OpenClaw folder access is likewise explicit. Connector's start-at-login preference is optional. Local status checks and caches are not an Organik-hosted collection service. App Store privacy disclosures should describe the final distributed build and its enabled integrations, including direct requests to the third-party services described above.

## Even G2 preview support

The optional Even G2 connection runs inside the same Connector installation. Its
HTTP service binds to loopback and uses a separate private Tailscale HTTPS route
and a separate client credential stored in macOS Keychain. G2 apps can request
Apple Home lists and controls and view existing camera snapshots through this
connection. They cannot call the HomeKit helper's service-management endpoints.
Pairing details are copied only on request and the Connector clears its clipboard
copy after two minutes if another application has not replaced the clipboard.

When the user starts dictation, microphone audio travels from the glasses through
the Even phone app and the Connector to the speech provider configured on the Mac.
A local provider processes it locally; a hosted provider receives the audio under
that provider's privacy policy and may charge for usage. No hosted provider is
selected automatically. Provider credentials stay in macOS Keychain and the Mac
service's memory. The Connector does not log or save recordings or transcripts.
The G2 app displays a proposed home action for confirmation before executing it.
The phone app stores pairing and display preferences locally in its app storage.

Local Parakeet dictation downloads public model assets from Hugging Face during setup. Once cached, transcription runs on the Mac without uploading recordings. Audio is written to a private temporary WAV while the native helper reads it, then deleted after success or failure. The Connector does not retain transcripts. A custom speech provider remains optional and receives recordings only when selected.
