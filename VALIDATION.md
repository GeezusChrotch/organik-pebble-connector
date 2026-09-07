# Release validation

Connector 0.8.2 build 21 packages the user-accepted local app. Notesy 1.4.7 source `6820b8c802303d188ea914f5176d27c30f5f5490` and PBW `4de0c32cc86e851fc75bb9c390d3d941976c61ae92162192430e20257b13db03` are unchanged. Beepster 0.19.0 source is frozen at `1cbcc385199e63f1854bad428cc0bd1e424be8ed`. Only Beepster emoji-assets.js increases the maximum atlas cell size from 24 to 26 pixels; its SHA256 is `23fae51f6a01a957526e9ae95bc63423b701996ec69537e9b6faa44d694d4f4e`. Prior gateway module hashes remain in the vendor manifest.

Signature/platform checks passed. The running authenticated gateway rendered 15 real emojis at 26 pixels into a 130×78 atlas with exactly 10,140 pixel bytes. The Beepster owner reports 199 tests and watch builds passed; watch installation succeeded and the user accepted the result. Notesy runtime and configuration were preserved. Publication does not redeploy locally.

Signing, notarization, stapling, downloaded checksums and Sparkle signature verification are completed during publication. SHA256SUMS accompanies the release. Existing managed Beepster installations must run Set up service after updating.
