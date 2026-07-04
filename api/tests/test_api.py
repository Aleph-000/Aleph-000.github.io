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
        prefixed_health = client.get("/api/health")
        assert prefixed_health.status_code == 200
        assert prefixed_health.json()["ok"] is True

        registered = client.post(
            "/auth/register",
            json={"username": "Aleph_null", "password": "password123"},
        )
        assert registered.status_code == 200
        token = registered.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert registered.json()["user"]["is_owner"] is True

        reader = client.post(
            "/auth/register",
            json={
                "username": "reader",
                "password": "password123",
                "display_name": "Reader",
            },
        )
        assert reader.status_code == 200
        reader_headers = {"Authorization": f"Bearer {reader.json()['access_token']}"}
        assert reader.json()["user"]["is_owner"] is False

        posts = client.get("/posts")
        assert posts.status_code == 200
        assert any(item["slug"] == "24-points-machine" for item in posts.json())

        search = client.get("/search", params={"q": "AI"})
        assert search.status_code == 200
        assert search.json()

        created_comment = client.post(
            "/posts/24-points-machine/comments",
            json={"body": "A useful project case."},
            headers=reader_headers,
        )
        assert created_comment.status_code == 200
        assert created_comment.json()["user"]["username"] == "reader"
        whitespace_comment = client.post(
            "/posts/24-points-machine/comments",
            json={"body": "   "},
            headers=reader_headers,
        )
        assert whitespace_comment.status_code == 422

        liked = client.post("/posts/24-points-machine/like", headers=reader_headers)
        assert liked.status_code == 200
        assert liked.json()["likes"] == 1
        assert liked.json()["liked"] is True

        favorited = client.post(
            "/posts/24-points-machine/favorite", headers=reader_headers
        )
        assert favorited.status_code == 200
        assert favorited.json()["favorites"] == 1

        favorites = client.get("/me/favorites", headers=reader_headers)
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

        forbidden_admin_create = client.post(
            "/admin/posts",
            json={
                "slug": "reader-post",
                "title": "Reader Post",
                "excerpt": "Should not be created.",
                "body": "Only owner can create online posts.",
            },
            headers=reader_headers,
        )
        assert forbidden_admin_create.status_code == 403

        online_created = client.post(
            "/admin/posts",
            json={
                "slug": "online-lab-note",
                "title": "Online Lab Note",
                "excerpt": "A database-backed article.",
                "body": "This article is stored in the API database.",
                "published": True,
            },
            headers=headers,
        )
        assert online_created.status_code == 200
        assert online_created.json()["published"] is True

        online_detail = client.get("/posts/online-lab-note")
        assert online_detail.status_code == 200
        assert online_detail.json()["source"] == "online"

        online_comment = client.post(
            "/posts/online-lab-note/comments",
            json={"body": "Online comments work."},
            headers=reader_headers,
        )
        assert online_comment.status_code == 200
        online_comment_id = online_comment.json()["id"]

        online_like = client.post("/posts/online-lab-note/like", headers=reader_headers)
        assert online_like.status_code == 200
        assert online_like.json()["likes"] == 1

        admin_posts = client.get("/admin/posts", headers=headers)
        assert admin_posts.status_code == 200
        assert admin_posts.json()[0]["slug"] == "online-lab-note"

        admin_comments = client.get("/admin/comments", headers=headers)
        assert admin_comments.status_code == 200
        assert any(item["id"] == online_comment_id for item in admin_comments.json())

        renamed = client.put(
            "/admin/posts/online-lab-note",
            json={
                "slug": "online-lab-note-renamed",
                "title": "Online Lab Note Renamed",
                "published": True,
            },
            headers=headers,
        )
        assert renamed.status_code == 200
        assert renamed.json()["slug"] == "online-lab-note-renamed"

        old_detail = client.get("/posts/online-lab-note")
        assert old_detail.status_code == 404
        renamed_comments = client.get("/posts/online-lab-note-renamed/comments")
        assert renamed_comments.status_code == 200
        assert renamed_comments.json()[0]["body"] == "Online comments work."
        renamed_interactions = client.get(
            "/posts/online-lab-note-renamed/interactions",
            headers=reader_headers,
        )
        assert renamed_interactions.status_code == 200
        assert renamed_interactions.json()["likes"] == 1

        forbidden_delete_comment = client.delete(
            f"/admin/comments/{online_comment_id}", headers=reader_headers
        )
        assert forbidden_delete_comment.status_code == 403
        deleted_comment = client.delete(
            f"/admin/comments/{online_comment_id}", headers=headers
        )
        assert deleted_comment.status_code == 200

        unpublished = client.put(
            "/admin/posts/online-lab-note-renamed",
            json={"published": False},
            headers=headers,
        )
        assert unpublished.status_code == 200
        hidden_detail = client.get("/posts/online-lab-note-renamed")
        assert hidden_detail.status_code == 404

        deleted_post = client.delete(
            "/admin/posts/online-lab-note-renamed", headers=headers
        )
        assert deleted_post.status_code == 200

        missing_interaction = client.post("/posts/missing-post/like", headers=headers)
        assert missing_interaction.status_code == 404
