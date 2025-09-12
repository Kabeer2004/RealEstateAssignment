import os
from dotenv import load_dotenv
from slowapi import Limiter
from slowapi.util import get_remote_address

# Load .env
load_dotenv()

# Rate Limiter
limiter = Limiter(key_func=get_remote_address)

# API Keys
BLS_API_KEY = os.getenv("BLS_API_KEY")
CENSUS_API_KEY = os.getenv("CENSUS_API_KEY")

# Redis
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

# CORS
ORIGINS = [
    "http://localhost:3000",
    # Add your deployed frontend URL here later
]