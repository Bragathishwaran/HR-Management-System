"""Module 1 — Authentication & Roles (register, login, current user)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole, utcnow
from app.schemas import TokenResponse, UserRead, UserRegister
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])


async def _username_or_email_taken(db: AsyncSession, username: str, email: str) -> str | None:
    existing = await db.scalar(
        select(User).where((User.username == username) | (User.email == email))
    )
    if existing is None:
        return None
    return "username" if existing.username == username else "email"


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    payload: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Register a user.

    Rules:
    - The very first account bootstraps the system as ADMIN.
    - Requesting HR/ADMIN role requires an already-authenticated ADMIN token.
    - Everyone else self-registers as EMPLOYEE.
    """
    role = payload.role
    if role in (UserRole.HR, UserRole.ADMIN):
        # Optional bearer: only an ADMIN may mint privileged accounts.
        auth_header = request.headers.get("Authorization", "")
        is_admin = False
        if auth_header.lower().startswith("bearer "):
            creds = HTTPAuthorizationCredentials(
                scheme="Bearer", credentials=auth_header.split(" ", 1)[1]
            )
            try:
                current = await get_current_user(credentials=creds, db=db)
                is_admin = current.role == UserRole.ADMIN
            except HTTPException:
                is_admin = False
        else:
            # Bootstrap: if the database is empty, the first account becomes ADMIN.
            user_count = await db.scalar(select(func.count()).select_from(User))
            if (user_count or 0) == 0:
                role = UserRole.ADMIN
                is_admin = True

        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an ADMIN can register users with HR or ADMIN role.",
            )

    conflict = await _username_or_email_taken(db, payload.username, payload.email.lower())
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The {conflict} is already registered.",
        )

    user = User(
        username=payload.username,
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        role=role,
        created_at=utcnow(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Login and obtain a JWT access token",
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """OAuth2 password grant.

    The ``username`` form field accepts either a username or an email address.
    """
    identifier = form_data.username.strip()
    user = await db.scalar(
        select(User).where(
            or_(User.username == identifier, User.email == identifier.lower())
        )
    )
    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact an administrator.",
        )

    token = create_access_token(
        subject=user.id, username=user.username, role=user.role.value
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=UserRead, summary="Current authenticated user")
async def read_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
