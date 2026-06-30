from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gcp_project_id:      str = "aranyai"
    gee_service_account: str = "aranyai-gee@aranyai.iam.gserviceaccount.com"
    gee_key_file:        str = "gee-sa-key.json"
    gcs_bucket:          str = "aranyai-exports-aranyai"
    database_url:        str = "postgresql://postgres:postgres@localhost:5432/postgres"
    jwt_secret:           str = "change-me-in-env"
    jwt_algorithm:         str = "HS256"
    jwt_expire_minutes:    int = 60 * 24 * 30  # 30 days — persistent login


settings = Settings()
