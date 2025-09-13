import os
from dotenv import load_dotenv
from slowapi import Limiter
from pathlib import Path
from slowapi.util import get_remote_address

# Load .env
dotenv_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=dotenv_path)

# Rate Limiter
limiter = Limiter(key_func=get_remote_address)

# API Keys
BLS_API_KEY = os.getenv("BLS_API_KEY")
CENSUS_API_KEY = os.getenv("CENSUS_API_KEY")

# Database
DATABASE_URL = os.getenv("DATABASE_URL")

# Redis
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

# CORS
ORIGINS = [
    "http://localhost:3000",
    # Add your deployed frontend URL here later
]