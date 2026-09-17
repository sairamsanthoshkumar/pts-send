import unittest

from app.api.v1.endpoints.ingestion import measurement_selection_policy
from app.api.v1.endpoints.ingestion import _sample_collection_lbdtc, _expand_pristima_lb_rows, normalize_juvenile_weaning_rows
from app.core.config import settings


class MeasurementSelectionTests(unittest.TestCase):
    def setUp(self):
        settings.LBModuleLetter = "H,S,U"
        settings.EGModuleLetter = "A,I"
        settings.VSModuleLetter = "A,I"

    def test_pristima_sample_generalized_is_assigned_to_lb(self):
        result = measurement_selection_policy("PRISTIMA_API", {
            "measurement_name": "Generalized Measurement", "sample_subject": True,
        })
        self.assertFalse(result["eligible"])
        self.assertEqual(result["default_domain"], "LB")

    def test_pristima_juvenile_weaning_day_is_assigned_to_sc(self):
        result = measurement_selection_policy("PRISTIMA_API", {"measurement_name": "Juvenile Weaning Day"})
        self.assertEqual(result["default_domain"], "SC")

    def test_juvenile_weaning_day_keeps_one_approved_row_per_animal(self):
        rows = normalize_juvenile_weaning_rows([
            {"MEASUREMENT_NAME": "Juvenile Weaning Day", "SUBJID": "J1", "APPROVED": "Y"},
            {"MEASUREMENT_NAME": "Juvenile Weaning Day", "SUBJID": "J1", "APPROVED": "Y"},
            {"MEASUREMENT_NAME": "Juvenile Weaning Day", "SUBJID": "J2", "APPROVED": "N"},
        ])
        self.assertEqual([row["SUBJID"] for row in rows], ["J1"])

    def test_pristima_non_animal_generalized_is_excluded(self):
        result = measurement_selection_policy("PRISTIMA_API", {
            "measurement_name": "Generalized Measurement", "animal_subject": False,
        })
        self.assertFalse(result["eligible"])

    def test_vpts_lb_module_is_hidden_but_eg_vs_modules_are_assigned(self):
        lb = measurement_selection_policy("CSV", {"measurement_name": "Generalized Measurement", "module_letter": "H"})
        self.assertFalse(lb["eligible"])
        self.assertEqual(lb["default_domain"], "LB")
        eg = measurement_selection_policy("CSV", {"measurement_name": "Generalized Measurement", "module_letter": "A"})
        self.assertTrue(eg["eligible"])
        self.assertEqual(eg["eligible_domains"], ["EG", "VS"])

    def test_lb_date_time_follows_sample_collection_status(self):
        self.assertEqual(_sample_collection_lbdtc({"STATUS": "COLLECTED", "ST_DATE_TAKEN": "2026-08-22", "ST_TIME_TAKEN": "10:15:00"}), "2026-08-22T10:15:00")
        self.assertEqual(_sample_collection_lbdtc({"STATUS": "COLLECTED", "ST_DATE_TAKEN": "2026-08-22"}), "2026-08-22")
        self.assertEqual(_sample_collection_lbdtc({"STATUS": "NOT TAKEN", "ST_DATE_TAKEN": "2026-08-22", "ST_TIME_TAKEN": "10:15:00"}), "2026-08-22")
        self.assertEqual(_sample_collection_lbdtc({"STATUS": "COLLECTED"}), "")

    def test_cell_morphology_expands_and_deduplicates_base_rows(self):
        rows = _expand_pristima_lb_rows([
            {"MEASUREMENT_NAME": "Cell Morphology", "SUBCATEGORY_NAME": "RBC", "SEVERITY_NAME": "Mild", "SIZE_NAME": "Size", "SIZE_VALUE": "Large", "MODIFIER_1Name": "Shape Round"},
            {"MEASUREMENT_NAME": "cell morphology", "SUBCATEGORY_NAME": "RBC", "SEVERITY_NAME": "Mild", "MODIFIER_1Name": "Color Red"},
        ])
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["LBTEST"], "RBC")
        self.assertEqual(rows[0]["Type"], 2)
        self.assertEqual(rows[0]["LBORRES"], "Mild, Size= Large")
        self.assertEqual(rows[1]["LBTEST"], "Shape")
        self.assertEqual(rows[1]["LBORRES"], "Round")

    def test_urine_microscopic_not_performed_and_unit(self):
        not_done = _expand_pristima_lb_rows([{
            "MEASUREMENT_NAME": "Urine Microscopic Examination", "SUBCATEGORY_NAME": "RBC",
            "SEVERITY_NAME": "not performed - insufficient sample", "MODIFIER_1Name": "Ignored Value",
        }])[0]
        self.assertEqual(not_done["LBSTAT"], "N")
        self.assertEqual(not_done["LBREASND"], "insufficient sample")
        self.assertIsNone(not_done["LBORRES"])

        done = _expand_pristima_lb_rows([{
            "MEASUREMENT_NAME": "Urine Microscopic", "SUBCATEGORY_NAME": "RBC",
            "SEVERITY_NAME": "5/HPF Mild", "MODIFIER_1Name": "Size Large",
        }])[0]
        self.assertEqual(done["LBORRESU"], "5/HPF")
        self.assertEqual(done["Type"], 3)
        self.assertEqual(done["Modifier"], "5/HPF Mild, Size Large")


if __name__ == "__main__":
    unittest.main()