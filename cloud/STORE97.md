# Store 97 source handoff

Pome remains included, with the current HomeKit camera and TV/input controls. This is an isolated Store candidate; installed build95 and the direct96 draft are unchanged.

## Evidence

Xcode26.6 (17F113) universal Release compilation passed after running the exact Cloud bootstrap. Universal speech build, nested bundle executable audit, 12 G2 server tests, 2 executable-audit regression tests, and 7 readiness-gate tests passed. The local preflight is unsigned and is not a distributed Store artifact. Cloud97 must still be archived/exported and its actual signed package verified.

The current active Beepster/Pome G2 assets and gateway runtime match installed95; DayFrame uses validated0.1.10, with obsolete unreferenced assets omitted. Notesy1.4.8 is explicitly bundled. Helper Swift sources match the maintained checkout; CameraWindowHost matches the accepted camera50 source, while CacheTest and HomeControl include later G2 frame and TV/input changes. This supports source provenance, not a new claim of exhaustive device acceptance.

## Changes requiring acceptance

Contacts now uses a single Continue pre-alert before the system permission decision. Local G2 dictation requires deliberate setup consent explaining about500MB from Hugging Face and at least1GB setup space. Custom endpoints require consent before receiving recordings. First-use, denial/revocation, empty-cache download/retry and window lifecycle checks remain pending for this exact build. Beepster Pebble dictation has a reported progress/failure issue; its cause is undiagnosed and this candidate does not claim a fix. Broader glasses visual acceptance remains pending.

No known compiler or missing-executable blocker remains after preflight. These pending observations are not established Apple rejection reasons and are not converted into passes. The coordinator owns review access, metadata, exact exported-artifact verification, submission and later public-release decisions.

## Review access

STORE-SETUP.md explains per-app prerequisites and pairing. Pebble apps are installed separately through their phone app listings. Even G2 packages are bundled in cloud/Resources/EvenG2/<app>/dist and are downloadable from the frozen source commit. Published personal Beta status does not establish access for an Apple reviewer; the coordinator must provide a usable install/access arrangement. Owning or downloading a package does not establish that reviewers have compatible glasses or HomeKit hardware.

Official guidelines rechecked: https://developer.apple.com/app-store/review/guidelines/ . Permission, data-flow and download assessment is recorded in docs/APP-STORE-REVIEW.md, PRIVACY.md and cloud/NETWORK-SERVICES.md.

DayFrame correction: companion source was already0.1.10, but the initial installed95 resource baseline still contained0.1.8. The candidate now contains the validated0.1.10 dist and package SHA256 `2c80f230cf76bd8a22c37229c382466f4bd117c3792b8537f57c6c9985654ec5`. DayFrame dist intentionally differs from installed95; remaining gateway and active Beepster/Pome asset equivalence is unchanged.

DayFrame source reproducibility: corrected the lockfile pretext version label from0.1.8 to0.1.4, matching its existing0.1.4 tarball URL/integrity, package.json and maintained installed dependency. Clean npm installation and DayFrame unit tests were run; validated dist/package bytes were not rebuilt.
