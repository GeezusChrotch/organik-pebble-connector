# Release validation

Connector 0.8.0 build 19 uses immutable Notesy 1.4.6 runtime source `31ac94a43a9380754a91dc9f115d5dc09f88e5ed` and PBW SHA256 `f16357d690ca1c6bad33d98d5a9d482d5ef4438e7dcfedf8c2858ed9fa16f225`. The native PDF helper is rebuilt for Intel and Apple silicon. The shared image quantizer is included as a CJS module in both gateway runtimes.

Connector checks and all 91 Notesy tests passed with the bundled helper. Three PDF tests passed directly against packaged modules, covering 17-page navigation, specific-page embeds, rotated pages, all image modes, read-only guards and malformed/hidden PDFs. The Beepster owner reports 197 tests and release checks passed. Beepster source is frozen at `2c6657d75b27088c2711be993cc450458fe2c683`. All six changed Beepster runtime modules match the frozen input hashes in `vendor/beepster-gateway/CONNECTOR-INPUT-SHA256.json`; other runtime files retain the prior public vendor snapshot.

Earlier local test builds were installed and verified with settings preserved. Public 0.8.0 does not replace the local 0.7.3 build 18 test app. Physical-watch acceptance is a separate gate. Signing, notarization, stapling, downloaded checksums and Sparkle signatures are verified during publication.
