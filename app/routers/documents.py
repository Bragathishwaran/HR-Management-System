"""Module 16 — secure employee document management."""

from __future__ import annotations

from datetime import date as date_type
from datetime import timedelta
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Document, DocumentType, Employee, User, UserRole
from app.schemas import DocumentRead
from app.services.documents import (
    DocumentValidationError,
    delete_document_file,
    resolve_document_path,
    save_document,
)
from app.services.shifts import today_utc

router = APIRouter(
    prefix="/documents",
    tags=["Documents"],
    dependencies=[Depends(get_current_user)],
)


def _to_read(document: Document) -> DocumentRead:
    # ``Document.uploaded_by`` is an ORM relationship, while the response field is
    # the uploader's username, so build the schema explicitly.
    return DocumentRead(
        id=document.id,
        employee_id=document.employee_id,
        file_name=document.file_name,
        file_url=document.file_url,
        document_type=document.document_type,
        content_type=document.content_type,
        file_size=document.file_size,
        expiry_date=document.expiry_date,
        uploaded_at=document.uploaded_at,
        employee_name=(
            document.employee.full_name if document.employee is not None else None
        ),
        uploaded_by=(
            document.uploaded_by.username
            if document.uploaded_by is not None
            else None
        ),
    )


async def _load_document(db: AsyncSession, document_id: int) -> Document | None:
    return await db.scalar(
        select(Document)
        .options(
            selectinload(Document.employee),
            selectinload(Document.uploaded_by),
        )
        .where(Document.id == document_id)
    )


async def _authorized_document(
    db: AsyncSession, document_id: int, user: User
) -> Document:
    document = await _load_document(db, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found",
        )
    if user.role not in (UserRole.HR, UserRole.ADMIN):
        own = await db.scalar(
            select(Employee).where(Employee.user_id == user.id)
        )
        if own is None or document.employee_id != own.id:
            # 404 avoids leaking the existence of another employee's document.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document {document_id} not found",
            )
    return document


@router.post(
    "/upload",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an employee document (PDF, image or Word file)",
)
async def upload_document(
    file: UploadFile = File(...),
    employee_id: Optional[int] = Form(default=None, gt=0),
    document_type: DocumentType = Form(default=DocumentType.OTHER),
    expiry_date: Optional[date_type] = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentRead:
    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)
    if is_staff:
        target_id = employee_id
        if target_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="employee_id is required when uploading as HR/Admin.",
            )
    else:
        own = await db.scalar(
            select(Employee).where(Employee.user_id == current_user.id)
        )
        if own is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee profile is linked to this account.",
            )
        if employee_id is not None and employee_id != own.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only upload documents to your own profile.",
            )
        target_id = own.id

    employee = await db.get(Employee, target_id)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee {target_id} not found",
        )

    try:
        metadata = await save_document(file)
    except DocumentValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    document = Document(
        employee_id=employee.id,
        file_name=str(metadata["file_name"]),
        stored_name=str(metadata["stored_name"]),
        content_type=str(metadata["content_type"]),
        file_size=int(metadata["file_size"]),
        document_type=document_type,
        expiry_date=expiry_date,
        uploaded_by_id=current_user.id,
        # Filled after flush so the URL always points at the real record id.
        file_url="",
    )
    db.add(document)
    try:
        await db.flush()
        document.file_url = f"/documents/{document.id}/download"
        await db.commit()
    except Exception:
        await db.rollback()
        await delete_document_file(str(metadata["stored_name"]))
        raise

    document = await _load_document(db, document.id)
    assert document is not None
    return _to_read(document)


@router.get(
    "/",
    response_model=list[DocumentRead],
    summary="List documents (own for employees, all for HR/Admin)",
)
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    employee_id: Optional[int] = Query(default=None, gt=0),
    document_type: Optional[DocumentType] = Query(default=None),
    expiring_within_days: Optional[int] = Query(default=None, ge=1, le=365),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[DocumentRead]:
    is_staff = current_user.role in (UserRole.HR, UserRole.ADMIN)
    stmt: Select = select(Document).options(
        selectinload(Document.employee),
        selectinload(Document.uploaded_by),
    )

    if is_staff:
        if employee_id is not None:
            stmt = stmt.where(Document.employee_id == employee_id)
    else:
        own = await db.scalar(
            select(Employee).where(Employee.user_id == current_user.id)
        )
        if own is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No employee profile is linked to this account.",
            )
        stmt = stmt.where(Document.employee_id == own.id)

    if document_type is not None:
        stmt = stmt.where(Document.document_type == document_type)
    if expiring_within_days is not None:
        today = today_utc()
        stmt = stmt.where(
            Document.expiry_date.is_not(None),
            Document.expiry_date >= today,
            Document.expiry_date <= today + timedelta(days=expiring_within_days),
        )

    stmt = stmt.order_by(Document.uploaded_at.desc()).offset(skip).limit(limit)
    documents = list((await db.scalars(stmt)).all())
    return [_to_read(document) for document in documents]


@router.get(
    "/{document_id}",
    response_model=DocumentRead,
    summary="Document metadata (owner or HR/Admin)",
)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentRead:
    document = await _authorized_document(db, document_id, current_user)
    return _to_read(document)


@router.get(
    "/{document_id}/download",
    summary="Download a document (owner or HR/Admin)",
    response_class=FileResponse,
)
async def download_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    document = await _authorized_document(db, document_id, current_user)
    try:
        path = resolve_document_path(document.stored_name)
    except DocumentValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The stored file is no longer available.",
        )
    return FileResponse(
        path,
        media_type=document.content_type,
        filename=document.file_name,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document (HR/Admin)",
)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> Response:
    document = await _load_document(db, document_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found",
        )
    stored_name = document.stored_name
    await db.delete(document)
    await db.commit()
    await delete_document_file(stored_name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
