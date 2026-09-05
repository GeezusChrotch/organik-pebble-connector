# Connector 0.3.0 release

Release date: September 5, 2026. Public target: `GeezusChrotch/organik-pebble-connector`, tag `v0.3.0`.

This unified release adds numbered setup pages, a requirements overview with Fix actions, accurate Mac/private-route checks, hidden unused connectors, optional menu bar mode, configurable signed update checks, and optional Beepster OpenClaw/Hermes setup. PebClaw is removed. Tesla remains hidden by default, marked Coming soon, and requires an existing personal gateway.

Expected assets: `Organik-Apps-Pebble-Connector-0.3.0.dmg`, `appcast.xml`, `SHA256SUMS`, and the exact Notesy watch package bundled in the app. Final application source revisions and hashes are recorded with the release after validation. No legacy connector is published.

Release checks: current source and production dependencies; Swift/runtime deployment targets; required unit checks; signing; notarization and stapling; Gatekeeper; archive contents; independently verified Sparkle signature; downloaded asset checksums and live feed. Preserve the existing public update key. Never publish local Keychain credentials, operational logs, live preferences, or internal validation history.

Testing boundaries: build, emulator, and service checks do not prove a new physical-watch installation or fresh-user setup. State actual evidence in release notes without inferring tests. Watch apps update separately from the Connector.
