from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-me-in-production"
    APP_DEBUG: bool = False

    # Render injects DATABASE_URL as  postgres://...
    # We expose ASYNC_DATABASE_URL as  postgresql+asyncpg://...
    DATABASE_URL: str = "postgresql+asyncpg://ptssend:ptssend@localhost:5432/ptssend"

    @property
    def ASYNC_DATABASE_URL(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Auth
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # Poultry pool identifier loading for CSV studies. Default is disabled.
    PICKID_DB: str = "N"
    BIRTHDTC: str = "0"
    REQUIRE_BW_TIME_OF_COLLECTION: bool = False
    REQUIRE_OM_TIME_OF_COLLECTION: bool = False
    ADD_NEOPLASM_DB: str = "N"
    METASTATIC_FND_DB: str = "0"
    MIGRPID_VAL: str = "0"
    CHRONICITY_MODIFIERS: str = "Chronicity"
    PRIMARY_CAUSE_OF_DEATH_DB: str = "0"
    DDTissueName: str = "Systemic Cause of Death"
    DDIncludeAnimalLevelTissue: str = "N"
    CSVInputDir: str = "./data/input"
    R_TRANSFORM_XPT_COMMAND_FILE: str = "Savante_xpt_to_csv.bat"
    R_TRANSFORM_XLSX_COMMAND_FILE: str = "Savante_xlsx_to_csv.bat"
    PKMergeFlag: str = "N"
    PC_PP_ANALYSIS_NAMES: str = "Pharmacokinetics Concentration,Pharmacokinetics Parameter,PK Concentration,PK Parameter"
    EGSTRESC_CT_VALUES: str = ""
    LBModuleMode: int = 1
    EmptyValueMappedToN: bool = False
    IncludeNotCollected: str = "N"
    LBModuleLetter: str = ""
    EGModuleLetter: str = ""
    VSModuleLetter: str = ""
    CELL_MORPHOLOGY_MEASUREMENT_NAME: str = "CELL MORPHOLOGY"
    URINE_MICROSCOPIC_MEASUREMENT_NAME: str = "URINE MICROSCOPIC"
    Clinpath_Numeric_And_Text: bool = True
    Clinpath_Numeric_And_Text_Chars: str = "<>"
    GENERALIZED_ANIMAL_COMMENT_PARAMETERS: str = ""
    TEST_ARTICLE_DOSING_FREQUENCY_SUBSECTION: str = ""
    STUDY_DOSING_FREQUENCY_SUBSECTION: str = ""
    DOSING_SPECIFICATIONS: str = ""
    Output_Actual_Dosage: bool = False
    JUVENILE_WEANING_DAY_MEASUREMENT_NAME: str = "JUVENILE WEANING DAY"
    SYSTEM_LOG_DIR: str = "./logs"
    SESSION_LOAD_DIR: str = "./session-load"
    DOMAIN_OUTPUT_DIR: str = "./data/output"
    DEFINE_XML_CONF_DIR: str = "./Application/Output"
    DartStandardName: str = "SENDIG-DART"
    DartStandardVersion: str = "1.1"
    GeneToxStandardName: str = "SENDIG-GENETOX"
    GeneToxStandardVersion: str = "1.0"
    EFD_STAGE_START_RULE: str = "Confirmation of Mating"
    JUVENILE_STAGE_START_RULE: str = "Animal Birth"
    NOMLBLFMT: str = "Day {dd}"
    NOMLBLFMT_UNSCHEDULED: str = "Day {dd} Unscheduled"
    TATIO_TISSUE1_DB: str = "Brain"
    Round_before_calculations_DB: bool = False
    REPLACED_ANIMAL_GROUP_NAMES: str = "replaced animal"
    RECID_PREFIX: str = ""

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://pts-send-frontend.onrender.com",
    ]
    FRONTEND_URL: str = "https://pts-send-frontend.onrender.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
