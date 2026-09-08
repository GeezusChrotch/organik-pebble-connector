# Optional agent setup for Store Connector 1.0

**Prerelease integration guide. Connector 1.0 is not publicly released.** Ordinary Beepster messaging does not need an agent. Install plugins in your existing agent environment; the sandboxed Connector does not install or modify agent code.

These commands pin the reviewed plugin source to commit `4f04d9cd398844d75cb2ad34db2ad641c40367a9`. Hermes plugin version is 0.5.1; OpenClaw prompt plugin version is 0.2.0. [Source hashes](SOURCES.json) record upstream provenance. The plugins use the repository MIT license.

## Hermes

Use an existing Hermes installation with the plugin CLI and exact-request approval hooks. Run:

```sh
hermes plugins install GeezusChrotch/organik-pebble-connector/agents/hermes/beepster --ref 4f04d9cd398844d75cb2ad34db2ad641c40367a9
hermes plugins enable beepster
```

Generate a private token locally with `openssl rand -hex 32`. Add these two settings to your Hermes runtime environment (normally `~/.hermes/.env`), preserving all existing settings:

```dotenv
BEEPSTER_HERMES_BRIDGE_PORT=18792
BEEPSTER_HERMES_BRIDGE_TOKEN=PASTE_THE_GENERATED_HEX_TOKEN_HERE
```

Do not use the placeholder as a token. If a bridge token already exists, reuse it. Restart Hermes through its normal service controls when its current work is idle. The bridge listens only on `127.0.0.1`; do not expose this port with Tailscale Serve or Funnel.

In Connector → Beepster → Hermes, enter `http://127.0.0.1:18792/v1/beepster` and the same token, then save and check. Connector saves the token in Keychain. Choose a Hermes Telegram session and its matching Beeper Telegram chat. Edit the supplied Pebble thread prompt if desired.

A green light proves the bridge connection. Verify the selected session by sending your own test message and, separately, a harmless approval request you can recognize. The public install commands are source-pinned and use the supported Hermes CLI; a clean-account installation and physical approval round trip remain release gates.

## OpenClaw

Download the exact reviewed source into a new folder and install through OpenClaw's plugin manager:

```sh
git clone https://github.com/GeezusChrotch/organik-pebble-connector.git organik-connector-agent-setup
git -C organik-connector-agent-setup checkout --detach 4f04d9cd398844d75cb2ad34db2ad641c40367a9
openclaw plugins install ./organik-connector-agent-setup/agents/openclaw/organik-thread-prompts
openclaw plugins enable organik-thread-prompts
```

Review any plugin capability or trust prompt. Do not bypass an installation-policy rejection. Add the following to OpenClaw's global runtime `.env` (normally `~/.openclaw/.env`), preserving existing settings:

```dotenv
BEEPSTER_OPENCLAW_PROMPT_TRANSPORT=store-file
```

For a custom OpenClaw data folder, also set `BEEPSTER_OPENCLAW_HOME` to that folder. Restart OpenClaw through its normal controls when idle so the plugin and environment load.

In Connector → Beepster → OpenClaw, choose that same data folder. Pair/manage access when needed and approve the exact device request in OpenClaw. Keep the requested approval scope; general administrative access is not required. Select an OpenClaw Telegram session and matching Beeper Telegram chat. Save its Pebble-focused prompt.

Connector writes the scoped prompt mirror to `beepster/store-thread-prompts.json` inside the selected folder. The plugin appends instructions only for a matching session key, without editing the global prompt or conversation history. An approval-bridge green light alone does not verify this prompt plugin. Test an instruction in the linked session and confirm that an unrelated session is unaffected. That live prompt-injection test remains a release gate.

## Troubleshooting

- **No sessions:** only sessions with a Telegram route are eligible. Start or select the desired Telegram session in the agent, then refresh Connector.
- **Hermes red:** confirm plugin 0.5.1, idle restart, matching token and free loopback port. A wrong token is rejected; do not rotate a working token just for an app update.
- **OpenClaw prompt missing:** check enabled plugin, `store-file` environment, selected data folder and exact session match. Renaming a sidebar label does not create a new Telegram route.
- **Upgrade:** keep tokens, pairing and session links. Review newer pinned source before updating through the agent's plugin manager.
