# Organik Apps Pebble Connector

A native macOS 14+ connector for Notesy, Beepster, Reminderz, and Pome. Version **0.5.0** introduces a shared setup experience, a requirements-only overview, connector visibility, and Sparkle updates.

There is one build. Tesla is included but hidden by default, with **Coming soon** on its visibility option. It manages an existing personal gateway only. PebClaw is removed. Existing connector credentials, Notesy vault bookmarks, service endpoints, and watch protocols are preserved.

See the [user setup and migration guide](PUBLIC-README.md) and [privacy policy](PRIVACY.md).

## Interface and state

- Sidebar navigation: Overview, visible connectors, Settings.
- Overview: red/green requirement lights; Fix only on connectors with an unmet or unchecked requirement.
- Every connector: numbered Setup steps, Requirements, and a collapsed Troubleshooting section.
- Settings: visibility, update checks every 1–168 hours, and one app-wide Start at login control.
- Hiding changes presentation only. Running services, permission grants, and pairing remain intact. Hidden connectors do not add periodic dashboard checks. Showing Tesla does not launch a gateway.
- Private connection lights require an HTTP health check through the configured HTTPS route; a stored route alone is not ready.
- Only automatically checked requirements affect readiness. Notesy phone contact is informational; manual test checkboxes do not mark a working connector broken.

The shell is SwiftUI. The adapted Beepster and Reminderz modules expose typed requirements and actions while retaining their existing setup and pairing implementation. Their original AppKit controls are retained internally for those operations and are not shown as separate connector interfaces.

## Build and verify

Prerequisites: Xcode Command Line Tools, Node 20+, the sibling Notesy (`StoneNotes`) and Beepster (`beepster`) source directories, and the unified Connector's redistributable Beepster runtime/helper resources. Build and test Notesy first. No standalone Beepster app, PebClaw source or separate personal build is needed.

```sh
bash scripts/check.sh
bash scripts/build.sh
bash scripts/package.sh
bash scripts/generate-appcast.sh
```

Outputs: `build/Organik Apps Pebble Connector.app`, a versioned connector DMG, a versioned Notesy PBW, and `dist/appcast.xml`. The Notesy package version is read from its `package.json`. Default native architectures are arm64 and x86_64. Build scripts never install the result or change running apps.

Environment overrides:

| Variable | Purpose |
| --- | --- |
| `STONENOTES_SOURCE` | Notesy source directory |
| `BEEPSTER_RESOURCES` | Beepster runtime resources folder; defaults to the installed unified Connector |
| `BEEPSTER_GATEWAY_SOURCE` | Maintained gateway source; defaults to sibling `beepster/gateway` |
| `BEEPSTER_APP` | Optional legacy build-input override only; not a user-facing connector |
| `ORGANIK_ARCHES` | Architecture list; default `arm64 x86_64` |
| `ORGANIK_APP_DESTINATION` | Alternate build/package app path |
| `ORGANIK_SIGNING_IDENTITY` | Developer ID identity; default ad hoc for development |
| `ORGANIK_NOTARY_PROFILE` | Existing notarytool profile used during packaging |
| `ORGANIK_UPDATE_FEED` / `ORGANIK_UPDATE_PUBLIC_KEY` | Override HTTPS Sparkle appcast and public Ed25519 key together |
| `ORGANIK_RELEASE_URL_PREFIX` | Download URL prefix for generated appcast entries |

The packaged app is marked `unified`. Packaging refuses older public/personal editions, unmarked builds, and any bundle containing the removed relay. The old distribution flag is no longer used.

## Updating the connector

Sparkle **2.9.6** is downloaded from its official release, pinned by SHA-256 in `scripts/fetch-sparkle.sh`, linked into both architectures, and embedded with its license. Nested helpers are signed inside out. The updater verifies signed archives and handles download, installation, and relaunch. Automatic checks default to daily; downloading/installing requires the user’s approval. Profile submission is disabled.

The prepared feed URL is `https://github.com/GeezusChrotch/organik-pebble-connector/releases/latest/download/appcast.xml`. The public key is in `mac/Info.plist`. Its private signing key stays in macOS Keychain under Sparkle account `org.organikapps.pebbleconnector`; it is never bundled or exported by these scripts.

After signing and notarizing the final DMG, run `scripts/generate-appcast.sh`. It verifies that the signing account matches the bundled public key and creates a signed enclosure in `dist/appcast.xml`. Publish that exact DMG and appcast together as a GitHub release. Any subsequent archive modification requires regenerating the feed. The feed is prepared for the initial release; it will not deliver updates until the repository/release is published.

For framework integration details, see [Sparkle’s programmatic setup](https://sparkle-project.org/documentation/programmatic-setup/).

## Maintaining upstream adapters

The adapted native modules in `mac/` are the maintained integration. `python3 scripts/import-connectors.py` now stages upstream reference adapters under `build/upstream-reference` for manual comparison. It does not overwrite the integrated modules or their shared UI/status changes. Review and port upstream behavior deliberately; rerun checks afterward. Original source revisions and MIT licenses are retained under `vendor/`.

## Validation boundaries

Checks cover private-route matching and collision preservation, visibility migration/persistence, preserving hidden connector settings, navigation defaults, packaging exclusions, update-feed/key validation, private-data scans, and Swift compilation. A packaged build and a working Mac requirement do not prove physical-watch delivery. See [VALIDATION.md](VALIDATION.md) for observations and [RELEASE.md](RELEASE.md) for release preparation.

## Acknowledgments

Thank you to the upstream apps, developers, communities, and tools that made this possible. See [Acknowledgments](ACKNOWLEDGMENTS.md), also available from the app menu.

## Golden Gate development compatibility

The app supports macOS 14 and later, including the macOS 27 Golden Gate development host.
Every native compile must supply an explicit deployment target. On this development machine,
Swift's implicit target is macOS 28 even though the running OS is 27; do not use it for app previews.

Build and package scripts run `scripts/check-platform.py`, which inspects every native executable
and architecture slice, including helpers and Sparkle. It rejects a binary requiring a newer OS
than the app's declared macOS 14 minimum. SDK versions are not treated as minimum OS versions.

Prepare an isolated UI preview with `bash scripts/prepare-preview.sh` after building the app.
It reuses the validated release executable with a separate bundle identifier and preferences.

In Settings → Appearance, enable “Run in the menu bar and hide the Dock icon” to keep the Connector in the menu bar. The menu can reopen the window, open Settings, check connections or updates, and quit. Turn the option off to restore the Dock icon. Closing the window keeps services running.

Choose an app in the sidebar and follow its numbered Setup steps: prepare the source app or vault, grant required access, start the private connection, then pair your phone. Setup actions remain visible; Requirements shows current health, and Troubleshooting contains recovery actions.


For this release, set `BEEPSTER_GATEWAY_SOURCE="$PWD/vendor/beepster-gateway"` to use the exact bundled gateway source, and use the Notesy 1.2.0 source at commit `46776b6e691e72e3987c892eb2a423c04432d672`. Production dependencies are installed from the included lockfile.
