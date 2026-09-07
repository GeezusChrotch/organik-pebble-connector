# Privacy

Organik Apps Pebble Connector runs on your Mac. It does not create an Organik Apps account or upload your notes, reminders, messages, or vehicle data to an Organik Apps server.

Each connector uses its own permissions and pairing. Notesy reads the Obsidian vault you select and runs its local rendering service on the Mac. Reminderz uses macOS Reminders access. Beepster uses your separately configured Beeper Desktop API connection and optional read-only Contacts access. Pome connects to Itsyhome. The optional Tesla page connects to your existing personal gateway.

Optional OpenClaw and Hermes integration can deliver approval requests through Beepster to the Telegram chat you explicitly link. Setup may discover local agent sessions and read chat names from your configured Beeper connection. Enabling the Hermes bridge installs a local plugin; pairing, installation, and chat linking require an explicit action in setup. Approval contents and your decisions are handled by the linked agent and messaging services. These integrations are not required for ordinary messaging.

Credentials are stored through the existing macOS Keychain integrations. Vault bookmarks, endpoint preferences, and visibility choices are stored locally. Hiding a connector does not revoke permissions, erase data, or stop its service. You can change system permissions in System Settings → Privacy & Security.

Private connections use Tailscale. The connector does not enable Tailscale Funnel. Matching routes are reused, and routes assigned to other services are preserved. Your use of Beeper, Itsyhome, Tailscale, Tesla, and Apple services is also subject to their own privacy policies.

Update checks contact the configured GitHub release feed through Sparkle. GitHub receives normal network request information such as your IP address. Sparkle profile submission is disabled. You can disable automatic checks or change their frequency in Settings. Update downloads and installation require your approval. Signing keys used to publish releases are not included in the app.

The connector does not include analytics or advertising. A local ConnectionStatus.json file records requirement states and route-check error codes for troubleshooting. It contains no credentials, note content, private addresses, or vault paths, and is not uploaded. To share a problem report, remove tokens, pairing codes, private addresses, and personal content before posting it.

Optional thread system instructions are stored locally in Beepster/thread-prompts.json with owner-only file permissions and backups. The OpenClaw plugin and Hermes bridge read only the instructions matching the exact enabled session/chat link. The OpenClaw plugin requires conversation-hook and prompt-injection permission; the Hermes bridge adds ephemeral system context. Saving does not send a message, restart an agent, or modify its global prompt.

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
