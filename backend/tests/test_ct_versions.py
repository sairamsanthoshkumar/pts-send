import unittest

from fastapi.testclient import TestClient

from app.api.v1.endpoints.ct import _parse_package_terms
from app.core.security import create_access_token
from app.main import app


class CTVersionEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.headers = {"Authorization": f"Bearer {create_access_token('test-user')}"}

    def test_list_versions_returns_latest_first(self):
        response = self.client.get("/api/v1/ct/versions", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreater(len(payload), 0)
        self.assertEqual(payload[0]["version"], "SEND Terminology 2020-06-26")
        self.assertTrue(payload[0]["is_default"])

    def test_codelists_accepts_version_filter(self):
        response = self.client.get(
            "/api/v1/ct/codelists?version=SEND Terminology 2013-12-20",
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(any(item["codelist"] == "SPECIES" for item in payload))

    def test_import_csv_rejects_delete_action(self):
        csv_payload = """Codelist Code,Codelist Extensible,Codelist Name,Code,Submission Value,Name in Data,Value Key,ACTION
SEX,N,SEX,M,MALE,MALE,12345,D
"""
        response = self.client.post(
            "/api/v1/ct/import-csv",
            files={"file": ("ct-delete.csv", csv_payload, "text/csv")},
            headers=self.headers,
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("D for deletion is not supported", response.json()["detail"])

    def test_parse_package_terms_accepts_cdisc_format(self):
        payload = """Code\tCodelist Code\tCodelist Extensible (Yes/No)\tCodelist Name\tCDISC Submission Value\tCDISC Synonym(s)\tCDISC Definition\tNCI Preferred Term
C158118\t\tYes\tAge Estimation Method Response\tAGESMETH\tAge Estimation Method Response\tTerminology related to the method by which the age of an individual is determined through estimation.\tCDISC SEND Age Estimation Method Response Terminology
C158324\tC158118\t\tAge Estimation Method Response\tANIMAL RECORDS\t\tInformation obtained from medical records, acquisition records, or other official documentation associated with the animal.\tAnimal Record Information
"""

        terms = _parse_package_terms(payload.encode("utf-8"), "SEND Terminology 2020-06-26", "SEND Terminology.txt")

        self.assertEqual(len(terms), 1)
        self.assertEqual(terms[0].codelist_code, "AGESMETH")
        self.assertEqual(terms[0].submission_value, "ANIMAL RECORDS")

    def test_parse_package_terms_accepts_cdisc_download_style_headers(self):
        payload = """Code\tCodelist Code\tCodelist Extensible (Yes/No)\tCodelist Name\tCDISC Submission Value\tCDISC Synonym(s)\tCDISC Definition\tNCI Preferred Term
C158118\t\tYes\tAge Estimation Method Response\tAGESMETH\tAge Estimation Method Response\tTerminology related to the method by which the age of an individual is determined through estimation.\tCDISC SEND Age Estimation Method Response Terminology
C158324\tC158118\t\tAge Estimation Method Response\tANIMAL RECORDS\t\tInformation obtained from medical records, acquisition records, or other official documentation associated with the animal.\tAnimal Record Information
"""

        terms = _parse_package_terms(payload.encode("utf-8"), "SEND Terminology 2020-06-26", "downloaded_ct.txt")

        self.assertEqual(len(terms), 1)
        self.assertEqual(terms[0].codelist_name, "Age Estimation Method Response")
        self.assertEqual(terms[0].submission_value, "ANIMAL RECORDS")


if __name__ == "__main__":
    unittest.main()
