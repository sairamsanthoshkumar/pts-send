import unittest

from app.api.v1.endpoints.ingestion import _normalize_lb_record, _normalize_ex_dosing_frequency
from app.api.v1.endpoints.transformation import (_apply_ex_dosing_specifications, calculate_indirect_dose,
                                                  normalize_inhalation_exposure)
from app.core.config import settings


class LBRulesTests(unittest.TestCase):
    def setUp(self):
        settings.LBModuleMode = 1

    def tearDown(self):
        settings.LBModuleMode = 1
        settings.Clinpath_Numeric_And_Text = True

    def test_lbnrind_boundaries(self):
        for row, expected in [
            ({"LBSTRESN": "10", "LBSTNRLO": "10", "LBSTNRHI": "20"}, "NORMAL"),
            ({"LBSTRESN": "9", "LBSTNRLO": "10", "LBSTNRHI": "20"}, "LOW"),
            ({"LBSTRESN": "21", "LBSTNRLO": "10", "LBSTNRHI": "20"}, "HIGH"),
        ]:
            _normalize_lb_record(row)
            self.assertEqual(row["LBNRIND"], expected)

    def test_lbstat_status_and_comment_matrix(self):
        cases = [
            ({"LBSTAT": "N", "LBORRES": ".", "COMMENT": "missing"}, "NOT DONE", "COCOMMENT"),
            ({"LBSTAT": "Y", "LBORRES": ".", "COMMENT": "missing"}, "NULL", "COCOMMENT"),
            ({"LBSTAT": "Y", "LBORRES": "12", "COMMENT": "verified"}, "NULL", "LBMODIFY"),
            ({"LBSTAT": "N", "LBORRES": ">12", "COMMENT": "above range"}, "NULL", "COCOMMENT"),
            ({"LBSTAT": "N", "LBORRES": "12", "COMMENT": "not done"}, "NOT DONE", "LBMODIFY"),
        ]
        for row, expected_status, comment_key in cases:
            _normalize_lb_record(row)
            self.assertEqual(row["LBSTAT"], expected_status)
            self.assertIn(comment_key, row)

    def test_signed_result_gets_calculation_value_when_enabled(self):
        row = {"LBORRES": "<4000", "LBSTRESC": "<4000", "LBSTRESN": ""}
        _normalize_lb_record(row)
        self.assertEqual(row["LBORRES"], "<4000")
        self.assertEqual(row["LBSTRESC"], "<4000")
        self.assertIsNone(row["LBSTRESN"])
        self.assertEqual(row["NUMERICAL_VALUE"], 4000.0)

    def test_signed_result_has_no_calculation_value_when_disabled(self):
        settings.Clinpath_Numeric_And_Text = False
        row = {"LBORRES": ">200", "LBSTRESC": ">200"}
        _normalize_lb_record(row)
        self.assertIsNone(row["NUMERICAL_VALUE"])

    def test_not_done_clears_all_range_variables(self):
        row = {"LBSTAT": "N", "LBORRES": ".", "LBORNRHI": "20", "LBORNRLO": "10",
               "LBSTNRHI": "20", "LBSTNRLO": "10", "LBSTNRC": "10-20", "LBNRIND": "NORMAL"}
        _normalize_lb_record(row)
        for variable in ("LBORNRHI", "LBORNRLO", "LBSTNRHI", "LBSTNRLO", "LBSTNRC", "LBNRIND"):
            self.assertIsNone(row[variable])

    def test_ex_dosing_frequency_prefers_regimen_over_study(self):
        row = {"REGIMEN_DOSING_FREQUENCY": "BID", "STUDY_DOSING_FREQUENCY": "QD"}
        _normalize_ex_dosing_frequency(row)
        self.assertEqual(row["EXDOSFRQ"], "BID")

    def test_ex_dosing_frequency_is_empty_without_source_value(self):
        row = {}
        _normalize_ex_dosing_frequency(row)
        self.assertEqual(row["EXDOSFRQ"], "")

    def test_zero_exdose_clears_exlot(self):
        row = {"EXDOSE": "0", "EXLOT": "LOT-1"}
        _normalize_ex_dosing_frequency(row)
        self.assertIsNone(row["EXLOT"])

    def test_ex_dosing_specification_matches_group_and_sex(self):
        settings.DOSING_SPECIFICATIONS = '[{"group":"G1","sex":"F","regimen":"REG-1","frequency":"QW","EXLOT":"LOT-9","EXROUTE":"ORAL"}]'
        record = type("Record", (), {"row_data": {"GROUP_NUMBER": "G1", "SEX": "F", "REGIMEN": "REG-1", "EXDOSE": "5"}})()
        _apply_ex_dosing_specifications([record])
        self.assertEqual(record.row_data["EXDOSFRQ"], "QW")
        self.assertEqual(record.row_data["EXLOT"], "LOT-9")
        self.assertEqual(record.row_data["EXROUTE"], "ORAL")
        settings.DOSING_SPECIFICATIONS = ""

    def test_indirect_dose_uses_mid_interval_body_weight(self):
        self.assertAlmostEqual(calculate_indirect_dose(10, 20, 50, 100, 200), 0.6666666666666666)

    def test_indirect_dose_rejects_non_positive_body_weight(self):
        self.assertIsNone(calculate_indirect_dose(10, 20, 100, 0, 200))

    def test_inhalation_exposure_truncates_time_and_clears_volumes(self):
        row = normalize_inhalation_exposure({"CALCULATION_TYPE": "10", "EXSTDTC": "2024-02-29T09:00:10", "EXENDTC": "2024-02-29T09:02:30", "EXVAMT": "5", "EXVAMTU": "mL"})
        self.assertEqual(row["EXSTDTC"], "2024-02-29T09:00:00")
        self.assertEqual(row["EXENDTC"], "2024-02-29T09:02:00")
        self.assertEqual(row["EXDUR"], "PT2M")
        self.assertIsNone(row["EXVAMT"])
        self.assertIsNone(row["EXVAMTU"])

    def test_mode_2_unknown_coded_comment_and_empty_value_option(self):
        settings.LBModuleMode = 2
        row = {"LBORRES": "<4", "COMMENT": "<4"}
        _normalize_lb_record(row)
        self.assertEqual(row["LBSTAT"], "NULL")
        self.assertEqual(row["LBSTRESC"], "<4")

        settings.EmptyValueMappedToN = True
        row = {"LBORRES": ".", "COMMENT": "CLT"}
        _normalize_lb_record(row)
        self.assertEqual(row["LBSTAT"], "NOT DONE")
        self.assertEqual(row["LBREASND"], "CLT")
        settings.EmptyValueMappedToN = False


if __name__ == "__main__":
    unittest.main()