from sqlalchemy import Column, String, JSON, DateTime
from sqlalchemy.sql import func
from core.database import Base

class ReportCache(Base):
    __tablename__ = 'report_cache'

    cache_key = Column(String, primary_key=True, index=True)
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())