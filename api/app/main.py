from contextlib import asynccontextmanager
from typing import Iterable

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import create_access_token, get_current_user, hash_password
from .auth import resolve_current_user, verify_password
from .config import settings
from .content import get_markdown_post, load_markdown_posts, search_markdown_posts
from .database import engine, get_db
from .models import Base, Comment, OnlinePost, PageView, Reaction, User, utcnow
from .schemas import AdminPostOut, AnalyticsOut, CommentCreate, CommentOut
from .schemas import InteractionOut, OnlinePostCreate, OnlinePostUpdate
from .schemas import PageViewIn, PostDetail, PostOut
from .schemas import TokenOut, UserCreate, UserLogin, UserOut


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Aleph_null Blog API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    path = request.scope.get("path", "")
    if path == "/api":
        request.scope["path"] = "/"
    elif path.startswith("/api/"):
        request.scope["path"] = path[4:]
    return await call_next(request)


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        is_owner=user.is_owner,
    )


def _comment_out(comment: Comment) -> CommentOut:
    return CommentOut(
        id=comment.id,
        post_slug=comment.post_slug,
        body=comment.body,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user=_user_out(comment.user),
    )


def _online_post_out(post: OnlinePost) -> PostOut:
    return PostOut(
        slug=post.slug,
        title=post.title,
        date=post.created_at.isoformat(),
        excerpt=post.excerpt,
        source="online",
    )


def _online_post_detail(post: OnlinePost) -> PostDetail:
    return PostDetail(
        slug=post.slug,
        title=post.title,
        date=post.created_at.isoformat(),
        excerpt=post.excerpt,
        body=post.body,
        source="online",
    )


def _admin_post_out(post: OnlinePost) -> AdminPostOut:
    return AdminPostOut(
        slug=post.slug,
        title=post.title,
        date=post.created_at.isoformat(),
        excerpt=post.excerpt,
        body=post.body,
        source="online",
        published=post.published,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _markdown_post_out(post) -> PostOut:
    return PostOut(
        slug=post.slug,
        title=post.title,
        date=post.date,
        excerpt=post.excerpt,
        source=post.source,
    )


def _require_owner(user: User) -> None:
    if not user.is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)


def _public_post_exists(db: Session, slug: str) -> bool:
    online_id = db.scalar(
        select(OnlinePost.id).where(
            OnlinePost.slug == slug,
            OnlinePost.published == True,  # noqa: E712
        )
    )
    return online_id is not None or get_markdown_post(slug) is not None


def _require_public_post(db: Session, slug: str) -> None:
    if not _public_post_exists(db, slug):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


def _count_reaction(db: Session, post_slug: str, kind: str) -> int:
    return db.scalar(
        select(func.count()).select_from(Reaction).where(
            Reaction.post_slug == post_slug,
            Reaction.kind == kind,
        )
    ) or 0


def _has_reaction(db: Session, user: User | None, post_slug: str, kind: str) -> bool:
    if not user:
        return False
    return (
        db.scalar(
            select(Reaction.id).where(
                Reaction.user_id == user.id,
                Reaction.post_slug == post_slug,
                Reaction.kind == kind,
            )
        )
        is not None
    )


def _interaction_out(db: Session, post_slug: str, user: User | None) -> InteractionOut:
    return InteractionOut(
        post_slug=post_slug,
        likes=_count_reaction(db, post_slug, "like"),
        favorites=_count_reaction(db, post_slug, "favorite"),
        liked=_has_reaction(db, user, post_slug, "like"),
        favorited=_has_reaction(db, user, post_slug, "favorite"),
    )


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "aleph-null-blog-api"}


@app.post("/auth/register", response_model=TokenOut)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> TokenOut:
    wants_owner = payload.username == settings.owner_username
    if (
        wants_owner
        and settings.owner_setup_key
        and payload.owner_key != settings.owner_setup_key
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    owner_exists = (
        db.scalar(select(User.id).where(User.is_owner == True)) is not None  # noqa: E712
    )
    user = User(
        username=payload.username,
        display_name=payload.display_name or payload.username,
        password_hash=hash_password(payload.password),
        is_owner=wants_owner and not owner_exists,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="username already exists") from exc
    db.refresh(user)
    return TokenOut(access_token=create_access_token(user), user=_user_out(user))


@app.post("/auth/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenOut:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return TokenOut(access_token=create_access_token(user), user=_user_out(user))


@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(user)


@app.get("/posts", response_model=list[PostOut])
def list_posts(db: Session = Depends(get_db)) -> list[PostOut]:
    markdown = [_markdown_post_out(post) for post in load_markdown_posts()]
    online = [
        _online_post_out(post)
        for post in db.scalars(
            select(OnlinePost)
            .where(OnlinePost.published == True)  # noqa: E712
            .order_by(OnlinePost.created_at.desc())
        )
    ]
    return online + markdown


@app.get("/admin/posts", response_model=list[AdminPostOut])
def list_admin_posts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AdminPostOut]:
    _require_owner(user)
    posts = db.scalars(select(OnlinePost).order_by(OnlinePost.created_at.desc()))
    return [_admin_post_out(post) for post in posts]


@app.post("/admin/posts", response_model=AdminPostOut)
def create_online_post(
    payload: OnlinePostCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminPostOut:
    _require_owner(user)
    post = OnlinePost(
        slug=payload.slug,
        title=payload.title,
        excerpt=payload.excerpt,
        body=payload.body,
        published=payload.published,
        author_id=user.id,
    )
    db.add(post)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="slug already exists") from exc
    db.refresh(post)
    return _admin_post_out(post)


@app.get("/admin/posts/{slug}", response_model=AdminPostOut)
def get_admin_post(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminPostOut:
    _require_owner(user)
    post = db.scalar(select(OnlinePost).where(OnlinePost.slug == slug))
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _admin_post_out(post)


@app.put("/admin/posts/{slug}", response_model=AdminPostOut)
def update_online_post(
    slug: str,
    payload: OnlinePostUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AdminPostOut:
    _require_owner(user)
    post = db.scalar(select(OnlinePost).where(OnlinePost.slug == slug))
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    data = payload.model_dump(exclude_unset=True)
    new_slug = data.pop("slug", None)
    old_slug = post.slug
    if new_slug and new_slug != old_slug:
        post.slug = new_slug
        db.execute(
            update(Comment)
            .where(Comment.post_slug == old_slug)
            .values(post_slug=new_slug)
        )
        db.execute(
            update(Reaction)
            .where(Reaction.post_slug == old_slug)
            .values(post_slug=new_slug)
        )
    for key, value in data.items():
        setattr(post, key, value)
    post.updated_at = utcnow()

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="slug already exists") from exc
    db.refresh(post)
    return _admin_post_out(post)


@app.delete("/admin/posts/{slug}")
def delete_online_post(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_owner(user)
    post = db.scalar(select(OnlinePost).where(OnlinePost.slug == slug))
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    db.execute(delete(Comment).where(Comment.post_slug == slug))
    db.execute(delete(Reaction).where(Reaction.post_slug == slug))
    db.delete(post)
    db.commit()
    return {"ok": True}


@app.get("/admin/comments", response_model=list[CommentOut])
def list_admin_comments(
    limit: int = Query(default=100, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommentOut]:
    _require_owner(user)
    comments = db.scalars(
        select(Comment).order_by(Comment.created_at.desc()).limit(limit)
    )
    return [_comment_out(comment) for comment in comments]


@app.delete("/admin/comments/{comment_id}")
def delete_admin_comment(
    comment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _require_owner(user)
    comment = db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    db.delete(comment)
    db.commit()
    return {"ok": True}


@app.get("/posts/{slug}", response_model=PostDetail)
def get_post(slug: str, db: Session = Depends(get_db)) -> PostDetail:
    online = db.scalar(
        select(OnlinePost).where(
            OnlinePost.slug == slug,
            OnlinePost.published == True,  # noqa: E712
        )
    )
    if online:
        return _online_post_detail(online)
    markdown = get_markdown_post(slug)
    if not markdown:
        raise HTTPException(status_code=404)
    return PostDetail(
        slug=markdown.slug,
        title=markdown.title,
        date=markdown.date,
        excerpt=markdown.excerpt,
        body=markdown.body,
        source=markdown.source,
    )


@app.get("/search", response_model=list[PostOut])
def search(q: str, db: Session = Depends(get_db)) -> list[PostOut]:
    query = q.strip()
    if not query:
        return []
    markdown = [_markdown_post_out(post) for post in search_markdown_posts(query)]
    online_posts: Iterable[OnlinePost] = db.scalars(
        select(OnlinePost).where(
            OnlinePost.published == True,  # noqa: E712
            (OnlinePost.title.contains(query)) | (OnlinePost.body.contains(query)),
        )
    )
    return [_online_post_out(post) for post in online_posts] + markdown


@app.get("/posts/{slug}/comments", response_model=list[CommentOut])
def list_comments(slug: str, db: Session = Depends(get_db)) -> list[CommentOut]:
    _require_public_post(db, slug)
    comments = db.scalars(
        select(Comment).where(Comment.post_slug == slug).order_by(Comment.created_at)
    )
    return [_comment_out(comment) for comment in comments]


@app.post("/posts/{slug}/comments", response_model=CommentOut)
def create_comment(
    slug: str,
    payload: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentOut:
    _require_public_post(db, slug)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422)
    comment = Comment(post_slug=slug, body=body, user_id=user.id)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_out(comment)


@app.delete("/posts/{slug}/comments/{comment_id}")
def delete_comment(
    slug: str,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    comment = db.get(Comment, comment_id)
    if not comment or comment.post_slug != slug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if comment.user_id != user.id and not user.is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    db.delete(comment)
    db.commit()
    return {"ok": True}


@app.get("/posts/{slug}/interactions", response_model=InteractionOut)
def interactions(
    slug: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> InteractionOut:
    _require_public_post(db, slug)
    user = resolve_current_user(db, authorization)
    return _interaction_out(db, slug, user)


@app.post("/posts/{slug}/like", response_model=InteractionOut)
def like_post(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InteractionOut:
    _require_public_post(db, slug)
    reaction = Reaction(user_id=user.id, post_slug=slug, kind="like")
    db.add(reaction)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return _interaction_out(db, slug, user)


@app.delete("/posts/{slug}/like", response_model=InteractionOut)
def unlike_post(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InteractionOut:
    _require_public_post(db, slug)
    db.execute(
        delete(Reaction).where(
            Reaction.user_id == user.id,
            Reaction.post_slug == slug,
            Reaction.kind == "like",
        )
    )
    db.commit()
    return _interaction_out(db, slug, user)


@app.post("/posts/{slug}/favorite", response_model=InteractionOut)
def favorite_post(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InteractionOut:
    _require_public_post(db, slug)
    reaction = Reaction(user_id=user.id, post_slug=slug, kind="favorite")
    db.add(reaction)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return _interaction_out(db, slug, user)


@app.delete("/posts/{slug}/favorite", response_model=InteractionOut)
def unfavorite_post(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InteractionOut:
    _require_public_post(db, slug)
    db.execute(
        delete(Reaction).where(
            Reaction.user_id == user.id,
            Reaction.post_slug == slug,
            Reaction.kind == "favorite",
        )
    )
    db.commit()
    return _interaction_out(db, slug, user)


@app.get("/me/favorites", response_model=list[PostOut])
def my_favorites(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PostOut]:
    slugs = db.scalars(
        select(Reaction.post_slug).where(
            Reaction.user_id == user.id,
            Reaction.kind == "favorite",
        )
    ).all()
    posts = {post.slug: _markdown_post_out(post) for post in load_markdown_posts()}
    for post in db.scalars(
        select(OnlinePost).where(
            OnlinePost.slug.in_(slugs),
            OnlinePost.published == True,  # noqa: E712
        )
    ):
        posts[post.slug] = _online_post_out(post)
    return [posts[slug] for slug in slugs if slug in posts]


@app.post("/analytics/pageview")
def pageview(
    payload: PageViewIn,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    view = PageView(
        path=payload.path,
        post_slug=payload.post_slug,
        user_agent=request.headers.get("user-agent", "")[:300],
    )
    db.add(view)
    db.commit()
    return {"ok": True}


@app.get("/analytics/summary", response_model=AnalyticsOut)
def analytics_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsOut:
    _require_owner(user)
    return AnalyticsOut(
        total_page_views=db.scalar(select(func.count()).select_from(PageView)) or 0,
        total_comments=db.scalar(select(func.count()).select_from(Comment)) or 0,
        total_users=db.scalar(select(func.count()).select_from(User)) or 0,
        total_likes=db.scalar(
            select(func.count()).select_from(Reaction).where(Reaction.kind == "like")
        )
        or 0,
        total_favorites=db.scalar(
            select(func.count()).select_from(Reaction).where(
                Reaction.kind == "favorite"
            )
        )
        or 0,
    )
