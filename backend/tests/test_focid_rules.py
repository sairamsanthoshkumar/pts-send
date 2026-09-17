import unittest

from app.api.v1.endpoints.transformation import apply_anatomical_region_rules, apply_focid_mappings


class FakeMapping:
    def __init__(self, domain_code, source_value, focid, locator=None):
        self.domain_code = domain_code
        self.source_value = source_value
        self.focid = focid
        self.locator = locator


class FakeRecord:
    def __init__(self, data):
        self.row_data = data


class FocidRulesTests(unittest.TestCase):
    def test_focus_mapping_is_applied_by_domain_source(self):
        records = {"EX": [FakeRecord({"EXLOC": "Injection Site A"})],
                   "CL": [FakeRecord({"CLLOC": "Right dorsal thorax"})],
                   "MA": [FakeRecord({"MASPEC": "Quadriceps, Injection Site A"})],
                   "MI": [FakeRecord({"MISPEC": "Quadriceps, Lower Left (Thigh)"})]}
        mappings = [FakeMapping("EX", "Injection Site A", "FOC-1"),
                    FakeMapping("CL", "Right dorsal thorax", "FOC-2"),
                    FakeMapping("MA", "Quadriceps, Injection Site A", "FOC-1"),
                    FakeMapping("MI", "Quadriceps, Lower Left (Thigh)", "FOC-1")]
        apply_focid_mappings(records, mappings)
        self.assertEqual(records["EX"][0].row_data["FOCID"], "FOC-1")
        self.assertEqual(records["CL"][0].row_data["FOCID"], "FOC-2")
        self.assertEqual(records["MA"][0].row_data["FOCID"], "FOC-1")
        self.assertEqual(records["MI"][0].row_data["FOCID"], "FOC-1")

    def test_mi_focus_can_be_propagated_to_tf(self):
        records = {"MI": [FakeRecord({"MISPEC": "Injection Site A"})],
                   "TF": [FakeRecord({"TFSPEC": "Injection Site A"})]}
        apply_focid_mappings(records, [FakeMapping("MI", "Injection Site A", "FOC-1")], True)
        self.assertEqual(records["TF"][0].row_data["FOCID"], "FOC-1")

    def test_tissue_and_locator_are_matched_as_a_pair(self):
        records = {"MA": [FakeRecord({"MASPEC": "cephalic", "MALOC": "left, proximal"})]}
        apply_focid_mappings(records, [FakeMapping("MA", "cephalic", "FOC-1", "left, proximal")])
        self.assertEqual(records["MA"][0].row_data["FOCID"], "FOC-1")

    def test_anatomical_region_is_suppressed_only_for_matching_3_1_focid(self):
        matching = {"MA": [FakeRecord({"MAANTREG": "Site A", "FOCID": "site a"})]}
        apply_anatomical_region_rules(matching, "3.1")
        self.assertIsNone(matching["MA"][0].row_data["MAANTREG"])

        retained = {"MA": [FakeRecord({"MAANTREG": "Injection A", "FOCID": "Site A"})]}
        apply_anatomical_region_rules(retained, "3.1")
        self.assertEqual(retained["MA"][0].row_data["MAANTREG"], "Injection A")


if __name__ == "__main__":
    unittest.main()