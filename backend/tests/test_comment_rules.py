import unittest

from app.api.v1.endpoints.transformation import _comment_co_row, _generalized_animal_comment_parameters
from app.core.config import settings


class CommentRulesTests(unittest.TestCase):
    def setUp(self):
        settings.GENERALIZED_ANIMAL_COMMENT_PARAMETERS = "ANIMAL_NOTE"

    def tearDown(self):
        settings.GENERALIZED_ANIMAL_COMMENT_PARAMETERS = ""

    def test_finding_comment_uses_record_sequence(self):
        record = type("Record", (), {"row_data": {"MASEQ": "7", "USUBJID": "A-1"}, "record_id": None})()
        row = _comment_co_row(record, "MA", 1, "finding note", sequence="7")
        self.assertEqual(row["IDVAR"], "MASEQ")
        self.assertEqual(row["IDVARVAL"], "7")
        self.assertEqual(row["COCOMMENT"], "finding note")

    def test_group_comment_has_no_record_sequence(self):
        record = type("Record", (), {"row_data": {"MIGRPID": "animal,phase,day"}, "record_id": None})()
        row = _comment_co_row(record, "MI", 1, "tissue note", group_id="animal,phase,day", sequence="")
        self.assertEqual(row["IDVAR"], "")
        self.assertEqual(row["COGRPID"], "animal,phase,day")

    def test_generalized_parameter_configuration_is_loaded(self):
        self.assertIn("ANIMAL_NOTE", _generalized_animal_comment_parameters())


if __name__ == "__main__":
    unittest.main()