import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.api.v1.endpoints.reports import generate_define_xml
from app.core.config import settings
from app.api.v1.endpoints.transformation import _apply_dart_paths, _apply_finding_type_categories, _apply_fw_pool_ids, _apply_interval_and_nominal_days, _apply_long_text_rules, _apply_not_taken_flags, _apply_organ_weight_ratios, _apply_phase_day_variables, _apply_recids, _apply_reference_dates_and_study_days, _apply_tissue_mappings, _apply_visit_days, _filter_replaced_records, _is_replaced_group_name, _juvenile_litterid_records, _trial_arm_definitions, _trial_element_definitions, _trial_path_records, _trial_set_records, _trial_stage_records, _subject_stage_records, _subject_reference_start_date


class DefineXmlTests(unittest.TestCase):
    def test_builds_fs30_phase_and_treatment_elements(self):
        rows = [
            {"PHASE_NAME": "Dose Phase", "PHASE_FOOTNOTE": "A", "SEX": "M", "GROUP_NUMBER": "1",
             "REQUIRED_ANIMALS": "2", "GROUP_DOSAGE": "5", "DOSE_VOLUME": "1", "COMPOUND": "XMS-1", "DOSE_UNIT": "mg/kg",
             "PHASE_START_DATE": "2026-01-01", "NEXT_PHASE_START_DATE": "2026-01-08"},
            {"PHASE_NAME": "Dose Phase", "PHASE_FOOTNOTE": "A", "SEX": "F", "GROUP_NUMBER": "1",
             "REQUIRED_ANIMALS": "2", "GROUP_DOSAGE": "10", "DOSE_VOLUME": "1", "COMPOUND": "XMS-1", "DOSE_UNIT": "mg/kg",
             "PHASE_START_DATE": "2026-01-01", "NEXT_PHASE_START_DATE": "2026-01-08"},
            {"PHASE_NAME": "Recovery", "PHASE_FOOTNOTE": "B", "SEX": "M", "GROUP_NUMBER": "2",
             "REQUIRED_ANIMALS": "1", "GROUP_DOSAGE": "0", "DOSE_VOLUME": "0", "PHASE_START_DATE": "2026-01-08",
             "NECROPSY_SCHEDULED": "Y", "NECROPSY_DATE": "2026-01-21"},
        ]
        definitions = _trial_element_definitions(rows)
        self.assertIn("PH", [item["etcd"][:2] for item in definitions])
        treatment = [item for item in definitions if item["type"] == "TREATMENT"]
        self.assertEqual({item["etcd"] for item in treatment}, {"M1AD", "F1AD"})
        self.assertTrue(any("XMS-1 5mg/kg" in item["element"] for item in treatment))
        self.assertFalse(any(item["etcd"].startswith("2") for item in treatment))
        dose_phase = next(item for item in definitions if item["type"] == "PHASE" and item["element"] == "Dose Phase")
        self.assertEqual(dose_phase["TESTRL"], "Start of Dose Phase phase")
        self.assertEqual(dose_phase["TEENRL"], "End of Dose Phase phase")
        self.assertEqual(dose_phase["TEDUR"], "P7D")
        recovery = next(item for item in definitions if item["type"] == "PHASE" and item["element"] == "Recovery")
        self.assertEqual(recovery["TEENRL"], "Scheduled sacrifice")
        self.assertEqual(recovery["TEDUR"], "P14D")
        male_treatment = next(item for item in treatment if item["etcd"] == "M1AD")
        self.assertEqual(male_treatment["TESTRL"], "First day of M1AD/G1:XMS-1 5mg/kg")

    def test_uses_confirmed_mating_date_for_efd_gestation(self):
        rows = [{"PHASE_NAME": "Gestation", "STUDY_TYPE": "EFD", "SEX": "F", "GROUP_NUMBER": "1",
                 "CONFIRMED_MATING_DATE": "2026-02-01", "PHASE_START_DATE": "2026-01-20",
                 "REQUIRED_ANIMALS": "1", "GROUP_DOSAGE": "0", "DOSE_VOLUME": "0"}]
        definition = next(item for item in _trial_element_definitions(rows) if item["type"] == "PHASE")
        self.assertEqual(definition["TESTRL"], "Start of Gestation phase")

    def test_builds_fs30_trial_arms_for_sex_split_and_partial_recovery(self):
        rows = [
            {"PHASE_NAME": "Dose", "SEX": "M", "GROUP_NUMBER": "1", "REQUIRED_ANIMALS": "4",
             "GROUP_DOSAGE": "5", "DOSE_VOLUME": "1", "RECOVERY": "N"},
            {"PHASE_NAME": "Dose", "SEX": "F", "GROUP_NUMBER": "1", "REQUIRED_ANIMALS": "4",
             "GROUP_DOSAGE": "10", "DOSE_VOLUME": "1", "RECOVERY": "N"},
            {"PHASE_NAME": "Recovery", "SEX": "M", "GROUP_NUMBER": "1", "REQUIRED_ANIMALS": "4",
             "GROUP_DOSAGE": "0", "DOSE_VOLUME": "0", "RECOVERY": "Y", "RECOVERY_ANIMAL_COUNT": "2", "CONTROL_TYPE": "Test"},
        ]
        arms = _trial_arm_definitions(rows)
        self.assertEqual({arm["armcd"] for arm in arms}, {"M1R", "M1", "F1"})
        self.assertEqual(next(arm for arm in arms if arm["armcd"] == "M1R")["arm"], "Test M1R")

    def test_builds_fs30_trial_set_parameters(self):
        rows = [{"PHASE_NAME": "Dose", "SEX": "M", "GROUP_NUMBER": "1", "GROUP_NAME": "Low Dose",
                 "GROUP_LABEL": "Low", "CONTROL_TYPE": "Test", "REQUIRED_ANIMALS": "2",
                 "GROUP_DOSAGE": "5", "DOSE_VOLUME": "1", "DOSE_UNIT": "mg/kg", "COMPOUND_CODE": "XMS-1"}]
        records = _trial_set_records("study-1", rows)
        self.assertEqual({record["SETCD"] for record in records}, {"1"})
        self.assertEqual({record["TXPARMCD"] for record in records}, {"ARMCD", "SPGRPCD", "GRPLBL", "TRTDOS", "TRTDOSU"})
        self.assertTrue(all(record["ARMCD"] == record["SETCD"] for record in records))
        self.assertTrue(all(record["SET"] == "1 Low Dose 1" for record in records))
        self.assertIn({"TXPARMCD": "GRPLBL", "TXPARM": "Group Label", "TXVAL": "G1 - XMS-1: 5mg/kg", "STUDYID": "study-1", "SETCD": "1", "SET": "1 Low Dose 1", "TXSEQ": 3, "ARMCD": "1"}, records)

    def test_formats_separate_male_and_female_group_labels(self):
        rows = [
            {"PHASE_NAME": "Dose", "SEX": "M", "GROUP_NUMBER": "1", "GROUP_DOSAGE": "5", "DOSE_VOLUME": "1",
             "DOSE_UNIT": "mg/kg", "COMPOUND_CODE": "XMS-1", "REQUIRED_ANIMALS": "1"},
            {"PHASE_NAME": "Dose", "SEX": "F", "GROUP_NUMBER": "1", "GROUP_DOSAGE": "10", "DOSE_VOLUME": "1",
             "DOSE_UNIT": "mg/kg", "COMPOUND_CODE": "XMS-1", "REQUIRED_ANIMALS": "1"},
        ]
        records = _trial_set_records("study-1", rows)
        self.assertEqual({record["TXVAL"] for record in records if record["TXPARMCD"] == "GRPLBL"},
                 {"G1 - XMS-1: 5mg/kg", "G1 - XMS-1: F:10mg/kg"})

    def test_builds_efd_trial_stages_from_unique_necropsy_schedules(self):
        rows = [
            {"PHASE_NAME": "Gestation", "STUDY_TYPE": "EFD", "GROUP_NUMBER": "1", "SEX": "F",
             "NECROPSY_SCHEDULED_DAY": "21", "SCHEDULED_DEATH_STATUS": "SCHEDULED SACRIFICE"},
            {"PHASE_NAME": "Gestation", "STUDY_TYPE": "EFD", "GROUP_NUMBER": "2", "SEX": "F",
             "NECROPSY_SCHEDULED_DAY": "6", "SCHEDULED_DEATH_STATUS": "SCHEDULED SACRIFICE"},
        ]
        stages = _trial_stage_records("study-1", rows)
        self.assertEqual({stage["STGCD"] for stage in stages}, {"GEST1", "GEST2"})
        self.assertEqual(next(stage for stage in stages if stage["STGCD"] == "GEST1")["TTDUR"], "P22D")

    def test_builds_juvenile_trial_stages_with_jta_codes(self):
        rows = [
            {"PHASE_NAME": "Postnatal", "STUDY_TYPE": "Juvenile", "GROUP_NUMBER": "1", "SUBGROUP_NUMBER": "1",
             "NECROPSY_SCHEDULED_DAY": "21", "SCHEDULED_DEATH_STATUS": "Scheduled sacrifice"},
            {"PHASE_NAME": "Postnatal", "STUDY_TYPE": "Juvenile", "GROUP_NUMBER": "1", "SUBGROUP_NUMBER": "2",
             "NECROPSY_SCHEDULED_DAY": "6", "SCHEDULED_DEATH_STATUS": "Scheduled sacrifice"},
        ]
        stages = _trial_stage_records("study-1", rows)
        self.assertEqual({stage["STGCD"] for stage in stages}, {"JTAS1", "JTAS2"})
        self.assertEqual(stages[0]["TTSTRL"], "Animal Birth")
        self.assertTrue(all(stage["STAGE"].endswith("D") for stage in stages))

    def test_builds_efd_trial_path_from_stage(self):
        rows = [{"PHASE_NAME": "Gestation", "STUDY_TYPE": "EFD", "PHASE_START_DAY": "Day 0",
                 "NECROPSY_SCHEDULED_DAY": "21", "SCHEDULED_DEATH_STATUS": "Scheduled sacrifice"}]
        path = _trial_path_records("study-1", rows)[0]
        self.assertEqual(path["PATHCD"], "GEST")
        self.assertEqual(path["PATH"], "GEST - Gestation 21D")
        self.assertEqual(path["TPSTGORD"], 1)
        self.assertIsNone(path["TPBRANCH"])
        self.assertEqual(path["RPHASE"], "Gestation")
        self.assertEqual(path["RPRFDY"], 0)

    def test_builds_juvenile_trial_path_with_prefix(self):
        rows = [{"PHASE_NAME": "Postnatal", "STUDY_TYPE": "Juvenile", "PHASE_START_DAY": "Day 1",
                 "NECROPSY_SCHEDULED_DAY": "6", "SCHEDULED_DEATH_STATUS": "Scheduled sacrifice"}]
        path = _trial_path_records("study-1", rows)[0]
        self.assertEqual(path["PATHCD"], "JTA")
        self.assertEqual(path["PATH"], "Juvenile Animal - Postnatal 6D")
        self.assertEqual(path["STAGE"], "Postnatal 6D")
        self.assertEqual(path["RPRFDY"], 1)

    def test_builds_subject_stage_and_dart_dm_path(self):
        rows = [{"PHASE_NAME": "Gestation", "STUDY_TYPE": "EFD", "USUBJID": "A1", "GROUP_NUMBER": "1",
                 "PHASE_START_DATE": "2026-01-01", "DEATH_DATE": "2026-01-22", "NECROPSY_SCHEDULED_DAY": "21",
                 "SCHEDULED_DEATH_STATUS": "Scheduled sacrifice"}]
        subject_stage = _subject_stage_records("study-1", rows)[0]
        self.assertEqual(subject_stage["USUBJID"], "A1")
        self.assertEqual(subject_stage["SJSTDTC"], "2026-01-01")
        self.assertEqual(subject_stage["SJENDTC"], "2026-01-22")
        path = _trial_path_records("study-1", rows)[0]
        class DM:
            row_data = {"GROUP_NUMBER": "1"}
        dm = DM()
        _apply_dart_paths([dm], [path])
        self.assertEqual(dm.row_data["PATHCD"], "GEST")

    def test_generates_juvenile_litterid_only_for_dart_12(self):
        rows = [{"PHASE_NAME": "Postnatal", "STUDY_TYPE": "Juvenile", "USUBJID": "nt_JuPo03-0001",
                 "DAM_NUMBER": "F010"}]
        records = _juvenile_litterid_records("nt_JuPo03", rows, "1.2")
        self.assertEqual(records[0]["SCTESTCD"], "LITTERID")
        self.assertEqual(records[0]["SCORRES"], "F010")
        self.assertEqual(_juvenile_litterid_records("nt_JuPo03", rows, "1.1"), [])

    def test_selects_rfstdtc_by_phase_priority_and_calculates_study_day(self):
        phases = [
            {"USUBJID": "A1", "PHASE_TYPE": "PRETEST", "PHASE_START_DATE": "2026-01-01"},
            {"USUBJID": "A1", "PHASE_TYPE": "RANDOMIZATION", "PHASE_START_DATE": "2026-01-03"},
            {"USUBJID": "A1", "PHASE_TYPE": "DOSING", "PHASE_START_DATE": "2026-01-05"},
        ]
        self.assertEqual(_subject_reference_start_date(phases)["A1"], "2026-01-05T00:00:00")
        class Record:
            measurement_type = "BW"
            row_data = {"USUBJID": "A1", "BWDTC": "2026-01-06", "BWDY": 999}
        record = Record()
        _apply_reference_dates_and_study_days([record], phases)
        self.assertEqual(record.row_data["BWDY"], 2)
        self.assertEqual(record.row_data["BWWEEK"], 1)

    def test_calculates_visitdy_from_subject_phase_start_and_day(self):
        phases = [{"USUBJID": "A1", "PHASE": "DOSE", "PHASE_START_DATE": "2026-01-05", "PHASE_TYPE": "DOSING"}]
        class Record:
            measurement_type = "LB"
            row_data = {"USUBJID": "A1", "PHASE": "DOSE", "DAYOFPHASE": "Day 3", "SCHEDULED": "Y"}
        record = Record()
        _apply_visit_days([record], phases)
        self.assertEqual(record.row_data["VISITDY"], 3)

    def test_calculates_vpts_cl_visitdy_without_scheduled_flag(self):
        phases = [{"USUBJID": "A1", "PHASE": "DOSE", "PHASE_START_DATE": "2026-01-05", "PHASE_TYPE": "DOSING"}]
        class Record:
            measurement_type = "CL"
            row_data = {"USUBJID": "A1", "PHASE": "DOSE", "DAY_OF_PHASE": "Day 1"}
        record = Record()
        _apply_visit_days([record], phases, "VPTS")
        self.assertEqual(record.row_data["VISITDY"], 1)

    def test_calculates_gestation_interval_and_nominal_label(self):
        phases = [{"USUBJID": "A1", "PHASE": "GESTATION", "PHASE_TYPE": "11",
                   "PHASE_START_DATE": "2026-01-01"}]
        class Record:
            measurement_type = "BW"
            row_data = {"USUBJID": "A1", "PHASE": "GESTATION", "BWDTC": "2026-01-08",
                        "DAYOFPHASE": "Day 8", "SCHEDULED": "Y", "RFSTDTC": "2026-01-01", "VISITDY": 8}
        record = Record()
        _apply_interval_and_nominal_days([record], phases, "study-1")
        self.assertEqual(record.row_data["INTERVAL_CD"], "G")
        self.assertEqual(record.row_data["INTERVAL_DAY"], 8)
        self.assertEqual(record.row_data["NOMDY"], 8)
        self.assertEqual(record.row_data["NOMLBL"], "Day 8")

    def test_calculates_planned_and_actual_phase_days(self):
        phases = [{"USUBJID": "A1", "PHASE": "DOSE", "PHASE_START_DATE": "2026-01-05"}]
        class Record:
            measurement_type = "BW"
            row_data = {"USUBJID": "A1", "PHASE": "DOSE", "DAYOFPHASE": "Day 8", "BWDTC": "2026-01-09",
                        "RFSTDTC": "2026-01-01", "SCHEDULED": "Y"}
        record = Record()
        _apply_phase_day_variables([record], phases)
        self.assertEqual(record.row_data["RPPLDY"], 8)
        self.assertEqual(record.row_data["BWRPDY"], 5)
        self.assertEqual(record.row_data["RPRFDY"], 5)

    def test_maps_non_extensible_not_taken_status_values(self):
        class NotTaken:
            measurement_type = "BW"
            row_data = {"BWSTAT": "N"}
        class Taken:
            measurement_type = "BW"
            row_data = {"BWSTAT": "T"}
        class Extensible:
            measurement_type = "BW"
            row_data = {"BWSTAT": "N", "BWSTAT_EXTENSIBLE": "Y"}
        records = [NotTaken(), Taken(), Extensible()]
        _apply_not_taken_flags(records)
        self.assertEqual(records[0].row_data["BWSTAT"], "NOT DONE")
        self.assertIsNone(records[1].row_data["BWSTAT"])
        self.assertEqual(records[2].row_data["BWSTAT"], "N")

    def test_generates_prefixed_pristima_recids_and_preserves_imported_ids(self):
        class Record:
            def __init__(self, domain, data):
                self.measurement_type = domain
                self.row_data = data
        positive_ma = Record("MA", {"PMFDAT_ID": "12345", "MAORRES": "Finding"})
        normal_mi = Record("MI", {"PMTFDT_ID": "88"})
        imported = Record("CL", {"CLRECID": "CSV-1", "OBSDAT_ID": "9"})
        settings.RECID_PREFIX = "XY"
        try:
            _apply_recids([positive_ma, normal_mi, imported], "PRISTIMA_API")
        finally:
            settings.RECID_PREFIX = ""
        self.assertEqual(positive_ma.row_data["MARECID"], "XY-PF-12345")
        self.assertEqual(normal_mi.row_data["MIRECID"], "XY-MN-88")
        self.assertEqual(imported.row_data["CLRECID"], "CSV-1")

    def test_combines_finding_and_neoplasm_types_by_domain(self):
        class MI:
            measurement_type = "MI"
            row_data = {"MIFINDINGTYPE": "Inflammation", "MINEOTYPE": "Benign"}
        class TF:
            measurement_type = "TF"
            row_data = {"TFNEOTYPE": "Malignant", "FINDING_TYPE": "Ignored"}
        records = [MI(), TF()]
        _apply_finding_type_categories(records)
        self.assertEqual(records[0].row_data["MIRESCAT"], "Inflammation, Benign")
        self.assertEqual(records[1].row_data["TFRESCAT"], "Malignant")

    def test_calculates_organ_ratios_and_marks_missing_denominators(self):
        class Record:
            def __init__(self, data):
                self.measurement_type = "OM"
                self.row_data = data
        organ = Record({"USUBJID": "A1", "OMSPEC": "Liver", "OMTESTCD": "ORGWT", "OMSTRESN": 2})
        brain = Record({"USUBJID": "A1", "OMSPEC": "Brain", "OMTESTCD": "ORGWT", "OMSTRESN": 1})
        brain_ratio = Record({"USUBJID": "A1", "OMSPEC": "Liver", "OMTESTCD": "OWBR"})
        body = Record({"USUBJID": "A1", "BWSTRESN": 100, "TERMINAL": "Y"})
        _apply_organ_weight_ratios([organ, brain, brain_ratio], [body])
        self.assertEqual(brain_ratio.row_data["OMSTRESN"], 200)

    def test_maps_tissue_to_multiple_empty_variables_without_overwriting_source(self):
        class Record:
            measurement_type = "MA"
            row_data = {"MASPEC": "Liver"}
        class Mapping:
            variable_name = "MAANTREG"
            source_value = "Liver"
            ct_value = "LIVER"
        record = Record()
        _apply_tissue_mappings([record], [Mapping()])
        self.assertEqual(record.row_data["MAANTREG"], "LIVER")
        self.assertEqual(record.row_data["MASPEC"], "Liver")

    def test_builds_fw_poolid_and_excludes_dead_animals(self):
        class Record:
            def __init__(self, data):
                self.row_data = data
        fw = Record({"SEDPHS_ID": "P1", "CAGE_NUMBER": "C1", "FWDTC": "2026-01-10"})
        pools = _apply_fw_pool_ids("study-1", [fw],
                                   [{"SEDPHS_ID": "P1", "CAGE_NUMBER": "C1", "SEDDM_ID": "A1"},
                                    {"SEDPHS_ID": "P1", "CAGE_NUMBER": "C1", "SEDDM_ID": "A2"}],
                                   [], [{"SEDDM_ID": "A2", "DSSTDTC": "2026-01-09"}])
        self.assertEqual(fw.row_data["POOLID"], "C1;A1")
        self.assertEqual(len(pools), 1)
        self.assertEqual(pools[0].row_data["POOLID"], "C1;A1")

    def test_excludes_replaced_groups_from_output(self):
        self.assertTrue(_is_replaced_group_name("Group 7 - Replaced Animal"))
        class Record:
            def __init__(self, data):
                self.row_data = data
        kept = Record({"GROUP_NUMBER": "1"})
        removed = Record({"GROUP_NUMBER": "7"})
        removed_subject = Record({"USUBJID": "A7"})
        phase_rows = [{"GROUP_NUMBER": "7", "GROUP_NAME": "Replaced Animal", "USUBJID": "A7"}]
        self.assertEqual(_filter_replaced_records([kept, removed, removed_subject], phase_rows), [kept])

    def test_splits_long_general_text_into_supplement_records(self):
        class Record:
            measurement_type = "MI"
            record_id = "MI1"
            row_data = {"USUBJID": "A1", "MISEQ": 1, "MIORRES": "word " * 90}
        record = Record()
        supplemental = _apply_long_text_rules([record], "study-1")
        self.assertLessEqual(len(record.row_data["MIORRES"]), 200)
        self.assertEqual(supplemental[0].row_data["QNAM"], "MIORRES1")
        self.assertEqual(supplemental[0].row_data["QLABEL"], "MIORRES")
        self.assertLessEqual(len(supplemental[0].row_data["QVAL"]), 200)

    def test_numbers_long_co_and_ts_values_and_caps_tx(self):
        class Record:
            def __init__(self, domain, data):
                self.measurement_type = domain
                self.row_data = data
        long_text = "x" * 450
        co = Record("CO", {"COVAL": long_text})
        ts = Record("TS", {"TSVAL": long_text})
        tx = Record("TX", {"TXVAL": long_text})
        _apply_long_text_rules([co, ts, tx], "study-1")
        self.assertEqual(len(co.row_data["COVAL"]), 200)
        self.assertEqual(len(co.row_data["COVAL1"]), 200)
        self.assertEqual(len(co.row_data["COVAL2"]), 50)
        self.assertEqual(len(ts.row_data["TSVAL2"]), 50)
        self.assertEqual(len(tx.row_data["TXVAL"]), 200)

    def test_calculates_phase_day_with_day_zero_flag(self):
        phases = [{"USUBJID": "A1", "SEDPHS_ID": "P1", "PHASE": "GESTATION", "PHASE_START_DATE": "2026-01-05", "DAY_ZERO": "Y"}]
        class Record:
            measurement_type = "MI"
            row_data = {"USUBJID": "A1", "SEDPHS_ID": "P1", "PHASE": "GESTATION", "MIDTC": "2026-01-05"}
        record = Record()
        _apply_phase_day_variables([record], phases)
        self.assertEqual(record.row_data["MIRPDY"], 0)

        phases[0]["DAY_ZERO"] = "N"
        record.row_data["MIDTC"] = "2026-01-06"
        _apply_phase_day_variables([record], phases)
        self.assertEqual(record.row_data["MIRPDY"], 2)

    def test_separates_actual_study_day_from_planned_visit_day_with_grace_day(self):
        phases = [
            {"USUBJID": "101", "PHASE": "PRETEST", "PHASE_TYPE": "PRETEST", "PHASE_START_DATE": "2010-01-01"},
            {"USUBJID": "101", "PHASE": "DOSING", "PHASE_TYPE": "DOSING", "PHASE_START_DATE": "2010-02-01"},
        ]
        class Record:
            measurement_type = "BW"
            row_data = {"USUBJID": "101", "PHASE": "DOSING", "BWDTC": "2010-02-09",
                        "DAYOFPHASE": "Day 8", "SCHEDULED": "Y"}
        record = Record()
        _apply_reference_dates_and_study_days([record], phases)
        _apply_visit_days([record], phases)
        self.assertEqual(record.row_data["BWDY"], 9)
        self.assertEqual(record.row_data["VISITDY"], 8)
        pretest = Record()
        pretest.row_data = {"USUBJID": "101", "PHASE": "PRETEST", "BWDTC": "2010-01-01",
                    "DAYOFPHASE": "Day 1", "SCHEDULED": "Y"}
        _apply_reference_dates_and_study_days([pretest], phases)
        _apply_visit_days([pretest], phases)
        self.assertEqual(pretest.row_data["BWDY"], -31)
        self.assertEqual(pretest.row_data["VISITDY"], -31)

    def test_calculates_age_day_from_birth_date(self):
        phases = [{"USUBJID": "101", "PHASE_TYPE": "DOSING", "PHASE_START_DATE": "2010-02-01",
                   "BRTHDTC": "2009-12-26"}]
        class Record:
            measurement_type = "BW"
            row_data = {"USUBJID": "101", "BWDTC": "2010-01-01"}
        record = Record()
        _apply_reference_dates_and_study_days([record], phases)
        self.assertEqual(record.row_data["AGE_DAY"], 7)
        self.assertEqual(record.row_data["AGEDY"], 7)
        self.assertEqual(record.row_data["AGE_WEEK"], 1)
        self.assertEqual(record.row_data["AGEWEEK"], 1)

    def test_calculates_postnatal_day_zero_and_week_from_birth_date(self):
        phases = [{"USUBJID": "P1", "PHASE": "POSTNATAL", "STUDY_TYPE": "Juvenile",
                   "PHASE_START_DATE": "2026-01-01", "BRTHDTC": "2026-01-01"}]
        class Record:
            measurement_type = "BW"
            row_data = {"USUBJID": "P1", "PHASE": "POSTNATAL", "BRTHDTC": "2026-01-01", "BWDTC": "2026-01-08"}
        record = Record()
        _apply_reference_dates_and_study_days([record], phases)
        self.assertEqual(record.row_data["POSTNATAL_DAY"], 7)
        self.assertEqual(record.row_data["POSTNATAL_WEEK"], 2)
        self.assertEqual(record.row_data["PNDY"], 7)

    def test_calculates_negative_weeks_in_seven_day_buckets(self):
        phases = [{"USUBJID": "101", "PHASE_TYPE": "DOSING", "PHASE_START_DATE": "2010-01-01"}]
        class Record:
            measurement_type = "BW"
            row_data = {"USUBJID": "101", "BWDTC": "2009-12-25"}
        record = Record()
        _apply_reference_dates_and_study_days([record], phases)
        self.assertEqual(record.row_data["BWWEEK"], -1)

        class PreReferenceRecord:
            measurement_type = "BW"
            row_data = {"USUBJID": "101", "BWDTC": "2009-12-31"}
        pre_reference = PreReferenceRecord()
        _apply_reference_dates_and_study_days([pre_reference], phases)
        self.assertEqual(pre_reference.row_data["BWWEEK"], -1)

        class OnReferenceRecord:
            measurement_type = "BW"
            row_data = {"USUBJID": "101", "BWDTC": "2010-01-07"}
        on_reference = OnReferenceRecord()
        _apply_reference_dates_and_study_days([on_reference], phases)
        self.assertEqual(on_reference.row_data["BWWEEK"], 1)

        class NextWeekRecord:
            measurement_type = "BW"
            row_data = {"USUBJID": "101", "BWDTC": "2010-01-08"}
        next_week = NextWeekRecord()
        _apply_reference_dates_and_study_days([next_week], phases)
        self.assertEqual(next_week.row_data["BWWEEK"], 2)

    def test_generates_define_xml_from_system_and_study_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nDM,Demographics\n", encoding="utf-8")
            (root / "Define.csv").write_text("Field-Option,Variable Name,Variable Label,DataType\nUSUBJID,USUBJID,Unique Subject Identifier,text\n", encoding="utf-8")
            (root / "Method.csv").write_text("Method Name,Description,Type\nDerive X,Derived value,Computation\n", encoding="utf-8")
            (root / "Metadata.csv").write_text("Dataset,Variable,Comparator,Where Values\nDM,SEX,equals,F\n", encoding="utf-8")
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"DM": ["USUBJID"]}):
                    output = generate_define_xml("Demo", root / "out", "2.1")
                text = output.read_text(encoding="utf-8")
                self.assertIn("DefineVersion=\"2.1\"", text)
                self.assertIn("DM", text)
                self.assertIn("USUBJID", text)
                self.assertIn("Derive X", text)
                self.assertIn("ValueListDef", text)
                self.assertIn('def:Standard OID="STD.01"', text)
                self.assertIn('Type="IG"', text)
                self.assertIn('OID="STD.CT.01"', text)
                self.assertIn('PublishingSet="SEND"', text)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_generates_method_expression_and_document_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nDM,Demographics\n", encoding="utf-8")
            (root / "Method.csv").write_text(
                "Method Name,Description,Type,Document,Complex Algorithms,Page,Expression Context,Expression Code\n"
                "Algorithm to derive USUBJID,Concatenation of STUDYID and SUBJID,Computation,,Complex Algorithms,USUBJID,SAS 9.0 or later,catx('.',STUDYID,SUBJID)\n",
                encoding="utf-8",
            )
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"DM": ["STUDYID"]}):
                    text = generate_define_xml("Demo", root / "out", "2.1").read_text(encoding="utf-8")
                self.assertIn("Concatenation of STUDYID and SUBJID", text)
                self.assertIn("Context=\"SAS 9.0 or later\"", text)
                self.assertIn("catx('.',STUDYID,SUBJID)", text)
                self.assertIn('leafID="LF.ComplexAlgorithms"', text)
                self.assertIn('PageRefs="USUBJID" Type="NamedDestination"', text)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_generates_value_level_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nTS,Trial Summary\n", encoding="utf-8")
            (root / "metadata.csv").write_text(
                "Dataset,Variable,Where Variables,Comparator,Where Values,Value Description,Data Type,Length,Core,Origin\n"
                "TS,TSVAL,TSPARMCD,EQ,TITLE,Title,text,57,Req,Assigned\n",
                encoding="utf-8",
            )
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"TS": ["TSVAL", "TSPARMCD"]}):
                    text = generate_define_xml("Demo", root / "out", "2.1").read_text(encoding="utf-8")
                self.assertIn('def:ValueListDef OID="VL.TS.TSVAL"', text)
                self.assertIn('def:WhereClauseDef OID="WC.TSPARMCD.TITLE"', text)
                self.assertIn('def:RangeCheck SoftHard="Soft" Comparator="EQ"', text)
                self.assertIn('def:ItemDef OID="IT.TS.TSVAL.TITLE"', text)
                self.assertIn('def:Origin Type="Assigned"', text)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_generates_multiple_value_level_conditions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nLB,Laboratory\n", encoding="utf-8")
            (root / "metadata.csv").write_text(
                "Dataset,Variable,Where Variables,Comparator,Where Values,Data Type,Core,Origin\n"
                "LB,LBORRES,LBTESTCD,LBCAT,LBSPEC,EQ,EQ,EQ,BILI,CHEMISTRY,BLOOD,text,Exp,Assigned\n",
                encoding="utf-8",
            )
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"LB": ["LBORRES"]}):
                    text = generate_define_xml("Demo", root / "out", "2.1").read_text(encoding="utf-8")
                self.assertIn('ItemOID="IT.LB.LBORRES.BILI_CHEMISTRY_BLOOD"', text)
                self.assertIn('def:WhereClauseRef WhereClauseOID="WC.LBTESTCD.BILI"', text)
                self.assertIn('def:WhereClauseRef WhereClauseOID="WC.LBCAT.CHEMISTRY"', text)
                self.assertIn('def:WhereClauseRef WhereClauseOID="WC.LBSPEC.BLOOD"', text)
                self.assertIn('def:RangeCheck SoftHard="Soft" Comparator="EQ"', text)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_accepts_define_rows_without_optional_format_column(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nTS,Trial Summary\n", encoding="utf-8")
            (root / "Define.csv").write_text(
                "Field-Option,Variable Name,Variable Label,Type,Format,Core,Role,Origin,Comment\n"
                "TSVAL,TS.TSVAL,Parameter Value,text,Req,Result Qualifier,OTHER,Study note\n",
                encoding="utf-8",
            )
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"TS": ["TSVAL"]}):
                    text = generate_define_xml("Demo", root / "out", "2.1").read_text(encoding="utf-8")
                self.assertIn('Name="Core" Value="Req"', text)
                self.assertIn('Name="Role" Value="Result Qualifier"', text)
                self.assertIn('Name="Origin" Value="OTHER"', text)
                self.assertIn('Name="Comment" Value="Study note"', text)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_accepts_headerless_supplement_define_row(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nDM,Demographics\n", encoding="utf-8")
            (root / "Define.csv").write_text(
                "SUPPLEMENT,Coded comment definition,coded comment definition.pdf ,,,,,,\n",
                encoding="utf-8",
            )
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"DM": ["STUDYID"]}):
                    text = generate_define_xml("Demo", root / "out", "2.1").read_text(encoding="utf-8")
                self.assertIn('Name="Supplement"', text)
                self.assertIn("Coded comment definition (coded comment definition.pdf)", text)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_generates_only_used_ct_terms_and_nci_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nBW,Body Weight\n", encoding="utf-8")
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            terms = [
                {"codelist": "BWTESTCD", "code": "BW", "label": "Body Weight"},
                {"codelist": "BWTESTCD", "code": "TERMBW", "label": "Terminal Body Weight"},
                {"codelist": "LBCAT", "code": "CHEMISTRY", "label": "Chemistry", "user_defined": True},
            ]
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"BW": ["BWTESTCD"]}):
                    xml = generate_define_xml("Demo", root / "out", "2.1", terms).read_text(encoding="utf-8")
                self.assertIn('CodedValue="BW"', xml)
                self.assertIn('Name="C81328" Context="nci:ExtCodeID"', xml)
                self.assertIn('Name="C90464" Context="nci:ExtCodeID"', xml)
                self.assertIn('Name="C89962" Context="nci:ExtCodeID"', xml)
                self.assertIn('def:StandardOID="STD.CT.01"', xml)
                self.assertIn('CodedValue="CHEMISTRY"', xml)
                self.assertNotIn('CodedValue="UNUSED"', xml)
                user_codelist = xml.split('<CodeList OID="LBCAT"', 1)[1].split('</CodeList>', 1)[0]
                self.assertNotIn('nci:ExtCodeID', user_codelist)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_generates_submission_context_origin_source_and_optional_standards(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nDM,Demographics\n", encoding="utf-8")
            (root / "Define.csv").write_text(
                "Field-Option,Variable Name,Variable Label,Type,Core,Origin,Source\n"
                "STUDYID,STUDYID,Study Identifier,text,Req,OTHER,Subject\n",
                encoding="utf-8",
            )
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"DM": ["STUDYID"]}):
                    xml = generate_define_xml("Demo", root / "out", "2.1", send_ig_version="3.1",
                                              controlled_terminology_version="2020-06-26",
                                              dart_enabled=True, genetox_enabled=True).read_text(encoding="utf-8")
                self.assertIn('def:Context="Submission"', xml)
                self.assertIn('def:Origin Type="OTHER" Source="Subject"', xml)
                self.assertIn('def:StandardName="SENDIG-DART"', xml)
                self.assertIn('def:StandardVersion="1.1"', xml)
                self.assertIn('def:StandardName="SENDIG-GENETOX"', xml)
                self.assertIn('def:StandardVersion="1.0"', xml)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_marks_optional_codelist_as_non_standard(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nTE,Trial Elements\n", encoding="utf-8")
            (root / "CodeLists.csv").write_text(
                "Domain,Variable Name,CodeList,CodedValue,TranslatedText\n"
                "TE,ETCD,Element Code,E1,Element one\n", encoding="utf-8")
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"TE": ["ETCD"]}):
                    xml = generate_define_xml("Demo", root / "out", "2.1").read_text(encoding="utf-8")
                self.assertIn('OID="TE.ETCD"', xml)
                self.assertIn('def:IsNonStandard="Yes"', xml)
                self.assertNotIn('OID="TE.ETCD" Name="Element Code" DataType="text" def:StandardOID', xml)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config

    def test_generates_optional_code_lists(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "domains.csv").write_text("Dataset,Description\nTX,Trial Sets\n", encoding="utf-8")
            (root / "CodeLists.csv").write_text(
                "Domain,Variable Name,CodeList,CodedValue,TranslatedText,Comments\n"
                "TX,SETCD,Set Code,F1,Positive control:MG1:FMG1F1,\n"
                "TX,SETCD,Set Code,F2,Dose:MG2:FMG2F2,\n"
                "TX,SET,Set Description,Positive control:MG1:FMG1F1,,\n"
                "TX,SET,Set Description,Dose:MG2:FMG2F2,,\n",
                encoding="utf-8",
            )
            old_config = settings.DEFINE_XML_CONF_DIR
            settings.DEFINE_XML_CONF_DIR = directory
            try:
                with patch("app.api.v1.endpoints.reports._discover_xpt_fields", return_value={"TX": ["SET", "SETCD"]}):
                    xml = generate_define_xml("Demo", root / "out", "2.1").read_text(encoding="utf-8")
                self.assertIn('<CodeList OID="TX.SETCD" Name="Set Code" DataType="text" def:IsNonStandard="Yes">', xml)
                self.assertIn('<CodeListItem CodedValue="F1">', xml)
                self.assertIn("Positive control:MG1:FMG1F1", xml)
                self.assertIn('<CodeList OID="TX.SET" Name="Set Description" DataType="text" def:IsNonStandard="Yes">', xml)
                self.assertIn('<EnumeratedItem CodedValue="Dose:MG2:FMG2F2" />', xml)
            finally:
                settings.DEFINE_XML_CONF_DIR = old_config


if __name__ == "__main__":
    unittest.main()