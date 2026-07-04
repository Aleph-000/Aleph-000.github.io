from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship


Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    display_name = Column(String(120), nullable=False)
    password_hash = Column(String(220), nullable=False)
    is_owner = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    comments = relationship("Comment", back_populates="user")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True)
    post_slug = Column(String(160), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow)

    user = relationship("User", back_populates="comments")


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (
        UniqueConstraint("user_id", "post_slug", "kind", name="uq_reaction_once"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_slug = Column(String(160), nullable=False, index=True)
    kind = Column(String(24), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class PageView(Base):
    __tablename__ = "page_views"

    id = Column(Integer, primary_key=True)
    path = Column(String(300), nullable=False, index=True)
    post_slug = Column(String(160), nullable=True, index=True)
    user_agent = Column(String(300), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class OnlinePost(Base):
    __tablename__ = "online_posts"

    id = Column(Integer, primary_key=True)
    slug = Column(String(160), unique=True, nullable=False, index=True)
    title = Column(String(220), nullable=False)
    excerpt = Column(Text, nullable=False, default="")
    body = Column(Text, nullable=False)
    published = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    category = Column(String(120), nullable=False, default="")
    tags = Column(Text, nullable=False, default="[]")
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow)
