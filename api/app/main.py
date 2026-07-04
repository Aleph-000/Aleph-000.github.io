from contextlib import asynccontextmanager
from typing import Iterable

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import create_access_token, get_current_user, hash_password
from .auth import resolve_current_user, verify_password
from .config import settings
from .content import get_markdown_post, load_markdown_posts, search_markdown_posts
from .database import engine, get_db
from .models import Base, Comment, OnlinePost, PageView, Reaction, User
from .schemas import AnalyticsOut, CommentCreate, CommentOut, InteractionOut
from .schemas import OnlinePostCreate, PageViewIn, PostDetail, PostOut
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
    user = User(
        username=payload.username,
        display_name=payload.display_name or payload.username,
        password_hash=hash_password(payload.password),
        is_owner=payload.username == settings.owner_username,
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
            select(OnlinePost).where(OnlinePost.published == True)  # noqa: E712
        )
    ]
    return online + markdown


@app.post("/admin/posts", response_model=PostDetail)
def create_online_post(
    payload: OnlinePostCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostDetail:
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
    return _online_post_detail(post)


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
    comment = Comment(post_slug=slug, body=payload.body.strip(), user_id=user.id)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_out(comment)


@app.get("/posts/{slug}/interactions", response_model=InteractionOut)
def interactions(
    slug: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> InteractionOut:
    user = resolve_current_user(db, authorization)
    return _interaction_out(db, slug, user)


@app.post("/posts/{slug}/like", response_model=InteractionOut)
def like_post(
    slug: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InteractionOut:
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
    for post in db.scalars(select(OnlinePost).where(OnlinePost.slug.in_(slugs))):
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
