import importlib.util
import pathlib
import plistlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('bundles', pathlib.Path(__file__).resolve().parents[1] / 'scripts/check-bundle-executables.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BundleTests(unittest.TestCase):
    def test_resource_repair_and_real_code_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            resource = root / 'FluidAudio_FluidAudio.bundle/Contents'
            (resource / 'Resources').mkdir(parents=True)
            info = resource / 'Info.plist'
            values = dict(CFBundleExecutable='FluidAudio_FluidAudio', CFBundleIdentifier='FluidAudio.FluidAudio.resources', CFBundlePackageType='BNDL', DTSDKBuild='unchanged')
            info.write_bytes(plistlib.dumps(values))
            self.assertEqual(len(module.inspect(root)[0]), 1)
            failures, repaired = module.inspect(root, True)
            self.assertFalse(failures)
            self.assertEqual(len(repaired), 1)
            self.assertEqual(plistlib.loads(info.read_bytes()), {k:v for k,v in values.items() if k != 'CFBundleExecutable'})
            code = root / 'Helper.app/Contents'
            code.mkdir(parents=True)
            (code / 'Info.plist').write_bytes(plistlib.dumps(dict(CFBundleExecutable='helper')))
            self.assertEqual(len(module.inspect(root, True)[0]), 1)
            (code / 'MacOS').mkdir()
            (code / 'MacOS/helper').write_bytes(b'code')
            self.assertFalse(module.inspect(root)[0])

    def test_unknown_resource_is_not_silently_repaired(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            bundle = root / 'Unknown.bundle'
            bundle.mkdir()
            (bundle / 'Info.plist').write_bytes(plistlib.dumps(dict(CFBundleExecutable='missing')))
            failures, repaired = module.inspect(root, True)
            self.assertTrue(failures)
            self.assertFalse(repaired)

if __name__ == '__main__': unittest.main()
