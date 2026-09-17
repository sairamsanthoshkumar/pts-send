import unittest

from app.api.v1.endpoints.transformation import resolve_relrec_rows, build_correlation_relrec_rows


class FakeRecord:
    def __init__(self, record_id, data):
        self.record_id = record_id
        self.row_data = data


class RelrecRulesTests(unittest.TestCase):
    def test_correlation_uses_one_relid_for_each_domain_member(self):
        correlation = {"CORRELATION_STATUS": "0", "RELID": "R-CORR", "SUBJID": "A-1",
                       "PM_ID": "pm-1", "MA_ID": "ma-1", "MI_ID": "mi-1"}
        records = {domain: [FakeRecord(identifier, {"SUBJID": "A-1", f"{domain}SEQ": sequence})]
                   for domain, identifier, sequence in (("PM", "pm-1", "1"), ("MA", "ma-1", "2"), ("MI", "mi-1", "3"))}
        rows = build_correlation_relrec_rows(correlation, records)
        self.assertEqual(len(rows), 3)
        self.assertEqual({row["RELID"] for row in rows}, {"R-CORR"})
        self.assertEqual({row["RDOMAIN"] for row in rows}, {"PM", "MA", "MI"})

    def test_sequence_reference_is_remapped_to_current_sequence(self):
        rows = resolve_relrec_rows(
            [{"RDOMAIN": "LB", "IDVAR": "LBSEQ", "IDVARVAL": "old-1", "RELID": "R1", "RELTYPE": "ONE"}],
            {"LB": [FakeRecord("old-1", {"LBSEQ": "4", "USUBJID": "A-1"})]}, "CSV", "3.1")
        self.assertEqual(rows[0]["IDVARVAL"], "4")
        self.assertEqual(rows[0]["RELID"], "R1")

    def test_non_sequence_reference_is_validated_without_rewriting(self):
        rows = resolve_relrec_rows(
            [{"RDOMAIN": "MA", "USUBJID": "A-1", "IDVAR": "MASPID", "IDVARVAL": "MASS 1", "RELID": "R2", "RELTYPE": "ONE"}],
            {"MA": [FakeRecord("rec-1", {"USUBJID": "A-1", "MASPID": "MASS 1"})]}, "CSV", "3.1")
        self.assertEqual(rows[0]["IDVARVAL"], "MASS 1")


if __name__ == "__main__":
    unittest.main()