FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /srv/blog

COPY api/requirements.txt /srv/blog/api/requirements.txt
RUN python -m pip install --no-cache-dir -r /srv/blog/api/requirements.txt

COPY api /srv/blog/api
COPY source /srv/blog/source

WORKDIR /srv/blog/api
ENV POSTS_DIR=/srv/blog/source/_posts

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
