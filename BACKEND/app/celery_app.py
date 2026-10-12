from celery import Celery

from app.database import settings


celery_app = Celery(
    "shophub",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"],
)
celery_app.conf.update(
    task_track_started=True,
    result_expires=86400,
    accept_content=["json"],
    task_serializer="json",
    result_serializer="json",
)
