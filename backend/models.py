from pydantic import BaseModel

class AddressInput(BaseModel):
    address: str
    geo_type: str = "tract"