# Beepster gateway

The gateway is the only Beepster component allowed to hold the Beeper Desktop access token. It
binds to loopback by default and is intended to be published to the user's phone with private HTTPS,
such as Tailscale Serve.

```sh
cp ../.env.example .env
# Load the variables using your preferred secret manager or shell.
npm start
```

Required variables:

- `BEEPER_ACCESS_TOKEN`: token created by Beeper Desktop for this gateway
- `BEEPSTER_GATEWAY_TOKEN`: independent long random token used by the phone transport

Optional variables:

- `BEEPER_BASE_URL` defaults to `http://127.0.0.1:23373`
- `BEEPSTER_HOST` defaults to `127.0.0.1`
- `BEEPSTER_PORT` defaults to `8794` (8787 is intentionally avoided because it is in use on the development Mac)

## macOS companion

`scripts/install-companion.sh` compiles a tiny Security-framework helper, places credentials in the
login Keychain, and installs a user LaunchAgent that invokes Node directly. It starts in setup mode
until a dedicated token from Beeper Desktop Settings → Integrations is stored as
`beeper-access-token`; `scripts/set-beeper-token.sh` accepts it with hidden terminal input. Run
`scripts/show-pairing-code.sh` only when pairing a phone. Run `scripts/doctor.sh` for a diagnostic
that checks the service without displaying either credential.

The public `/health` endpoint never includes credentials. `/configure` exchanges the one-time code
for the independent gateway token over private HTTPS. Authenticated routes read chats/messages,
render attachment previews, submit replies, and reconcile Beeper's final send status. Reply request
IDs make the phone's POST/GET compatibility fallback idempotent.

Do not bind the gateway directly to a public interface. Terminate HTTPS and enforce private-network
access in front of it. With Tailscale, use `tailscale serve --bg 8794`; do not use Funnel.
