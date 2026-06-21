"""Pydantic request/response schemas."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# --- Auth ---
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None
    department: str = "General"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    role: str
    department: str

    model_config = {"from_attributes": True}


# --- Chat ---
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: UUID | None = None
    department: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)


class Citation(BaseModel):
    source_index: int
    document_id: str
    title: str
    source: str | None = None
    department: str | None = None
    page_number: int | None = None
    content_snippet: str


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    domain: str
    confidence: float = 0.0
    tools_used: list[str] = Field(default_factory=list)
    conversation_id: UUID | None = None


# --- Documents ---
class DocumentMetadata(BaseModel):
    id: UUID
    title: str
    source: str
    department: str
    owner: str | None
    version: str
    sensitivity_level: str
    last_updated: datetime
    file_type: str | None = None

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    documents: list[DocumentMetadata]
    total: int


class ReindexRequest(BaseModel):
    document_id: UUID | None = None
    department: str | None = None


class ReindexResponse(BaseModel):
    status: str
    documents_processed: int
    message: str


class UploadResponse(BaseModel):
    document_id: UUID
    title: str
    chunks_created: int
    message: str


# --- Audit ---
class AuditLogEntry(BaseModel):
    id: UUID
    user_id: UUID | None
    action: str
    resource_type: str | None
    resource_id: str | None
    details: dict[str, Any]
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogEntry]
    total: int


# --- Health ---
class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    chroma: str
