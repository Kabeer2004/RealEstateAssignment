import redis.asyncio as redis
from core.config import REDIS_PASSWORD

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True, password=REDIS_PASSWORD)
