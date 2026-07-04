from datetime import datetime

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9_\-]+$")
    password: str = Field(min_length=8, max_length=120)
    display_name: str | None = Field(default=None, max_length=120)
    owner_key: str | None = Field(default=None, max_length=120)


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    is_owner: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PostOut(BaseModel):
    slug: str
    title: str
    date: str | None = None
    excerpt: str
    source: str
    category: str = ""
    tags: list[str] = Field(default_factory=list)


class PostDetail(PostOut):
    body: str


class OnlinePostCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=160, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    title: str = Field(min_length=1, max_length=220)
    excerpt: str = Field(default="", max_length=500)
    body: str = Field(min_length=1)
    published: bool = True
    sort_order: int = 0
    category: str = Field(default="", max_length=120)
    tags: list[str] = Field(default_factory=list, max_length=20)


class OnlinePostUpdate(BaseModel):
    slug: str | None = Field(
        default=None, min_length=2, max_length=160, pattern=r"^[a-z0-9][a-z0-9\-]*$"
    )
    title: str | None = Field(default=None, min_length=1, max_length=220)
    excerpt: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, min_length=1)
    published: bool | None = None
    sort_order: int | None = None
    category: str | None = Field(default=None, max_length=120)
    tags: list[str] | None = Field(default=None, max_length=20)


class AdminPostOut(PostDetail):
    published: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    id: int
    post_slug: str
    body: str
    created_at: datetime
    updated_at: datetime
    user: UserOut


class InteractionOut(BaseModel):
    post_slug: str
    likes: int
    favorites: int
    liked: bool = False
    favorited: bool = False


class PageViewIn(BaseModel):
    path: str = Field(min_length=1, max_length=300)
    post_slug: str | None = Field(default=None, max_length=160)


class OnlinePingIn(BaseModel):
    client_id: str = Field(min_length=8, max_length=120)
    path: str = Field(min_length=1, max_length=300)
    post_slug: str | None = Field(default=None, max_length=160)


class OnlineCountOut(BaseModel):
    online_readers: int


class AnalyticsOut(BaseModel):
    total_page_views: int
    total_comments: int
    total_users: int
    total_likes: int
    total_favorites: int
