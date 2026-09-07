# Release validation

Connector 0.8.1 build 20 uses immutable Notesy 1.4.7 source `6820b8c802303d188ea914f5176d27c30f5f5490` and PBW SHA256 `4de0c32cc86e851fc75bb9c390d3d941976c61ae92162192430e20257b13db03`. Beepster runtime is unchanged from public 0.8.0; its manifest is retained in the vendor source.

All 93 Notesy tests passed with the bundled native helper. Two packaged task-text checks passed for long UTF-8 content, continuation paging with one checkbox, exact task-marker edits and font-based row sizing. Installed runtime and watch package were verified and the user accepted the fix. This release packages the matching signed universal app without another local or watch installation.

Signing, notarization, stapling, downloaded checksums and Sparkle signature verification are completed during publication. Public release assets include SHA256SUMS. Requires macOS 14 or later, including macOS 27 compatibility validation.
