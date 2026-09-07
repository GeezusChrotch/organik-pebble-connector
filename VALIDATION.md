# Release validation

Connector 0.7.0 build 15 uses immutable Notesy 1.4.4 source `15f8010075460e606a51adb6c9350abaae26459f` and its matching PBW. Gateway bytes match the earlier tested 1.4.3 gateway. Beepster configuration-page.js comes from `93389970511968693376d846afbf8cd60bd7d926`, SHA256 `efb5c3aa84c2d149cae4ec055120ff70bad9460c71fdfed58a9e16bae2f65e54`; other runtime files are unchanged from the public vendor snapshot.

Connector checks passed. All 84 Notesy tests passed with the bundled native image helper. Basalt/Emery builds passed in the Notesy owning task. Generated Beepster settings scripts parse and include Main Top, 14 bindings and custom selection retention, with no scroll-distance field.

The universal release DMG is Developer ID signed, notarized and stapled. Apple accepted submission `2f87eaba-83de-4bd5-8031-f42b19acb297`. SHA256SUMS accompanies the release; the Sparkle signature and downloaded assets are checked during publication.

Prior Connector/Notesy test builds were installed and exercised, with pairing/state/routes preserved. The uniquely versioned 0.7.0 release is distinct from the locally installed 0.6.1 build 14 test candidate. No fresh local or physical-watch installation is claimed for this publication.
