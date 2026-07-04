import os
from pathlib import Path
import sys

from fastapi.testclient import TestClient


API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parent
sys.path.insert(0, str(API_ROOT))

os.environ["DATABASE_URL"] = f"sqlite:///{(API_ROOT / 'data' / 'test.db').as_posix()}"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["OWNER_USERNAME"] = "Aleph_null"
os.environ["POSTS_DIR"] = str(REPO_ROOT / "source" / "_posts")

from app.main import app  # noqa: E402


def test_auth_comments_reactions_and_analytics():
    db_file = API_ROOT / "data" / "test.db"
    if db_file.exists():
        db_file.unlink()

    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["ok"] is True

        registered = client.post(
            "/auth/register",
            json={"username": "Aleph_null", "password": "password123"},
        )
        assert registered.status_code == 200
        token = registered.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        posts = client.get("/posts")
        assert posts.status_code == 200
        assert any(item["slug"] == "24-points-machine" for item in posts.json())

        search = client.get("/search", params={"q": "AI"})
        assert search.status_code == 200
        assert search.json()

        created_comment = client.post(
            "/posts/24-points-machine/comments",
            json={"body": "A useful project case."},
            headers=headers,
        )
        assert created_comment.status_code == 200
        assert created_comment.json()["user"]["username"] == "Aleph_null"

        liked = client.post("/posts/24-points-machine/like", headers=headers)
        assert liked.status_code == 200
        assert liked.json()["likes"] == 1
        assert liked.json()["liked"] is True

        favorited = client.post("/posts/24-points-machine/favorite", headers=headers)
        assert favorited.status_code == 200
        assert favorited.json()["favorites"] == 1

        favorites = client.get("/me/favorites", headers=headers)
        assert favorites.status_code == 200
        assert favorites.json()[0]["slug"] == "24-points-machine"

        pageview = client.post(
            "/analytics/pageview",
            json={
                "path": "/2026/07/04/24-points-machine/",
                "post_slug": "24-points-machine",
            },
        )
        assert pageview.status_code == 200

        summary = client.get("/analytics/summary", headers=headers)
        assert summary.status_code == 200
        assert summary.json()["total_comments"] == 1
        assert summary.json()["total_likes"] == 1
        assert summary.json()["total_favorites"] == 1
