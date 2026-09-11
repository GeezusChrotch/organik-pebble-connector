# Cloud58 packaging correction

Cloud57 archived and exported successfully, then App Store upload rejected it with90261 because FluidAudio_FluidAudio.bundle declared CFBundleExecutable=FluidAudio_FluidAudio without containing that file. Failed Cloud build UUID:50b27314-a38c-416f-9b11-9d3262e37d52.

The pinned FluidAudio Swift package generates a resource-only bundle. Speech staging now removes only the invalid executable declaration from that known bundle, before parent-app signing. Bundle name/path, resources, identifier and SDK provenance fields are preserved. No executable is added or downloaded to conceal the error. Unknown missing executable declarations still fail validation.

The Cloud embed step audits all nested bundle plists for declared executable presence before archive completion. The local candidate validator runs the same check. Regression tests prove malformed-resource detection/repair, preservation of unrelated metadata, rejection of unknown missing code and acceptance of a present helper executable.

Validation completed: fresh speech staging reproduced and repaired the generated declaration; full installed57 bundle audit found only that defect; repair in a separate copied app passed executable audit, sandbox validation and deep strict signatures after renewing the main app's resource seal. Resource-only bundle is covered by the enclosing app signature; its Bundle.module lookup path is unchanged. No live-app files were modified. Cloud58 distribution export/upload remains a separate gate owned by the release coordinator.
