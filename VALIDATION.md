# Release validation

Connector 0.8.7 build 26 includes Beepster runtime frozen at `66a1baaea7e894873a6a3dcd5071d39ff9a92bab`; gateway hashes are in the vendor manifest. Notesy 1.4.8 source is `ac26636ffafeba7ffb47bbda246ba0912d338fbf`, PBW SHA256 `fd1ee0e465453ebb8e1538caf6277ab1ee16a92cdcf99e6a34c242bb1b4691d1`.

Native tests/typechecks, source privacy checks, updater checks and platform regression checks passed. Attachment requirement tests cover denied/unknown/missing/ready/revoked access. The local managed gateway confirmed Messages attachment access and rendered a real GIF. Beepster owner reports 220 tests and clean packaging checks; Notesy owner reports 94 tests and both watch builds. Emulator media-layout checks passed; latest physical-watch visual acceptance remains pending.

Publication verifies code signing, notarization, stapling, downloaded checksums and Sparkle signatures. SHA256SUMS accompanies the release. Existing managed Beepster installations must run Set up service after updating. Publication does not replace the installed local app or install watch packages. Experimental camera helper is excluded.
