"""Module 23 — Internal Announcements System."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Announcement, User
from app.schemas import AnnouncementCreate, AnnouncementRead

router = APIRouter(
    prefix="/announcements",
    tags=["Announcements"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/", response_model=AnnouncementRead, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    payload: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
) -> AnnouncementRead:
    announcement = Announcement(
        title=payload.title,
        message=payload.message,
        created_by_id=current_user.id,
    )
    db.add(announcement)
    await db.commit()
    announcement = await db.scalar(
        select(Announcement)
        .options(selectinload(Announcement.created_by_user))
        .where(Announcement.id == announcement.id)
    )  # type: ignore
    data = AnnouncementRead.model_validate(announcement).model_dump()
    if announcement.created_by_user is not None:
        data["created_by"] = announcement.created_by_user.username
    return AnnouncementRead(**data)


@router.get("/", response_model=list[AnnouncementRead])
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AnnouncementRead]:
    announcements = (
        await db.scalars(
            select(Announcement)
            .options(selectinload(Announcement.created_by_user))
            .order_by(Announcement.created_at.desc())
        )
    ).all()
    result: list[AnnouncementRead] = []
    for ann in announcements:
        data = AnnouncementRead.model_validate(ann).model_dump()
        if ann.created_by_user is not None:
            data["created_by"] = ann.created_by_user.username
        result.append(AnnouncementRead(**data))
    return result


@router.get("/{announcement_id}", response_model=AnnouncementRead)
async def get_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnnouncementRead:
    announcement = await db.scalar(
        select(Announcement)
        .options(selectinload(Announcement.created_by_user))
        .where(Announcement.id == announcement_id)
    )
    if announcement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    data = AnnouncementRead.model_validate(announcement).model_dump()
    if announcement.created_by_user is not None:
        data["created_by"] = announcement.created_by_user.username
    return AnnouncementRead(**data)


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    announcement = await db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")
    await db.delete(announcement)
    await db.commit()
    return None
