import uuid

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel
from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from typing import Any


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)


class GPSRecord(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    commaddr: str = Field(max_length=64)  # 车辆标识（车牌号）
    utc: str = Field(max_length=32)       # 时间戳（UTC时间类型）
    lat: float                            # 经度坐标
    lon: float                            # 纬度坐标
    head: float                           # 方向角
    speed: float                          # 车辆速度（m/s）
    tflag: int                            # 车辆状态（1为载客，0为空载）


class TaxiOrder(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    commaddr: str = Field(max_length=64)  # 车辆标识（车牌号）
    onutc: str = Field(max_length=32)    # 上车时间戳（UTC时间类型）
    onlat: float                          # 上车点纬度坐标
    onlon: float                          # 上车点经度坐标
    offutc: str = Field(max_length=32)   # 下车时间戳（UTC时间类型）
    offlat: float                         # 下车点纬度坐标
    offlon: float                         # 下车点经度坐标
    distance: float | None = Field(default=None)  # 行驶距离（米）

class RoadSurfaceDetection(SQLModel, table=True):
    __tablename__ = "road_surface_detection"
    id: int | None = Field(default=None, primary_key=True)
    file_data: str = Field(sa_column=Column(Text, nullable=False))
    file_type: str = Field(nullable=False, max_length=10)
    disease_info: Any = Field(sa_column=Column(JSONB, nullable=False))
    detection_time: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    alarm_status: bool = Field(default=False, nullable=False)


class Weather(SQLModel, table=True):
    Time_new: str = Field(max_length=255, primary_key=True)
    Temperature: float | None = Field(default=None)
    Humidity: int | None = Field(default=None)
    Wind_Speed: int | None = Field(default=None)
    Precip: float | None = Field(default=None)