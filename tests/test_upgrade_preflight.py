import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('upgrade_preflight', Path(__file__).resolve().parents[1]/'scripts/upgrade_preflight.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class UpgradePreflightTests(unittest.TestCase):
    def setUp(self):
        self.working = dict(bundle='connector', sandbox=True, groups=['home'], pome=True, build=95)
    def test_ordinary_update_preserves_existing_integrations(self):
        self.assertEqual(module.incompatibilities(self.working, dict(self.working, build=98)), [])
    def test_direct96_transition_is_rejected(self):
        failures = module.incompatibilities(self.working, dict(self.working, sandbox=False, groups=[], pome=False, build=96))
        self.assertEqual(len(failures), 3)
    def test_removing_home_group_is_rejected_even_with_helper_present(self):
        self.assertTrue(module.incompatibilities(self.working, dict(self.working, groups=[])))
    def test_new_features_are_allowed(self):
        self.assertEqual(module.incompatibilities(dict(self.working, pome=False, groups=[]), self.working), [])

class HealthRegressionTests(unittest.TestCase):
    def test_lost_working_service_is_detected(self):
        before = {'apps':[{'app':'Beepster','requirements':[{'id':'beeper','ready':True}]}]}
        self.assertEqual(module.health_regressions(before, {'apps':[]}), [('Beepster','beeper')])
    def test_existing_failure_is_not_new_regression(self):
        before = {'apps':[{'app':'Beepster','requirements':[{'id':'beeper','ready':False}]}]}
        self.assertEqual(module.health_regressions(before, {'apps':[]}), [])
    def test_shared_network_failure_is_reported(self):
        self.assertEqual(module.health_regressions({'tailscale':{'ready':True}}, {}), [('All apps','tailscale')])

class EditionSwitchTests(unittest.TestCase):
    def test_explicit_switch_preserves_team_and_sandbox(self):
        before = dict(bundle='connector',sandbox=True,groups=['group.org.organikapps.pebbleconnector'],pome=True,team='same')
        self.assertTrue(module.github_edition_switch(before,dict(before,groups=[],pome=False)))
        self.assertFalse(module.github_edition_switch(before,dict(before,groups=[],pome=False,team='other')))
        self.assertFalse(module.github_edition_switch(before,dict(before,groups=[],pome=False,sandbox=False)))
    def test_unrelated_group_cannot_be_removed(self):
        before = dict(bundle='connector',sandbox=True,groups=['unrelated'],pome=True,team='same')
        self.assertFalse(module.github_edition_switch(before,dict(before,groups=[],pome=False)))

if __name__ == '__main__': unittest.main()
