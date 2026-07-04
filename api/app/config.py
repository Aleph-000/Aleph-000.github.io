from pathlib import Path
import os


REPO_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = REPO_ROOT / "api"


class Settings:
    def __init__(self) -> None:
        sqlite_path = API_ROOT / "data" / "blog.db"
        default_db = f"sqlite:///{sqlite_path.as_posix()}"
        self.database_url = os.getenv("DATABASE_URL", default_db)
        self.secret_key = os.getenv("SECRET_KEY", "dev-only-change-me")
        self.access_token_minutes = int(os.getenv("ACCESS_TOKEN_MINUTES", "10080"))
        self.owner_username = os.getenv("OWNER_USERNAME", "Aleph_null")
        self.cors_origins = [
            item.strip()
            for item in os.getenv("CORS_ORIGINS", "*").split(",")
            if item.strip()
        ]
        self.posts_dir = Path(
            os.getenv("POSTS_DIR", str(REPO_ROOT / "source" / "_posts"))
        )


settings = Settings()
