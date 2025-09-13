import os
import redis.asyncio as redis
from core.config import REDIS_PASSWORD

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")

redis_client = redis.Redis(host=REDIS_HOST, port=6379, db=0, decode_responses=True, password=REDIS_PASSWORD)
