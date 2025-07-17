from datetime import timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app import crud
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core import security
from app.core.config import settings
from app.core.security import get_password_hash
from app.models import EmailVerification, Message, NewPassword, Token, UserPublic
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    render_email_template,
    send_email,
    verify_password_reset_token,
)

router = APIRouter(tags=["login"])


@router.post("/login/access-token")
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    # 检查邮箱验证状态
    email_verification = session.scalars(select(EmailVerification).where(EmailVerification.user_id == user.id)).first()
    if email_verification:
        # 验证令牌是否过期
        is_token_valid = verify_password_reset_token(email_verification.verification_token)
        if not is_token_valid and email_verification.is_verified:
            # 若令牌过期且之前已验证，将验证状态重置为 false
            email_verification.is_verified = False
            session.commit()

    if not email_verification or not email_verification.is_verified:
        # 生成验证令牌
        token = generate_password_reset_token(user.email)
        if not email_verification:
            email_verification = EmailVerification(
                user_id=user.id,
                verification_token=token
            )
            session.add(email_verification)
        else:
            email_verification.verification_token = token
        session.commit()

        # 发送验证邮件
        subject = "邮箱验证"
        link = f"{settings.FRONTEND_HOST}/verify-email?token={token}"
        html_content = render_email_template(
            template_name="verify_email.html",
            context={
                "project_name": settings.PROJECT_NAME,
                "username": user.full_name or user.email,
                "link": link
            }
        )
        send_email(
            email_to=user.email,
            subject=subject,
            html_content=html_content
        )
        raise HTTPException(
            status_code=403,
            detail="请检查邮箱完成验证后再登录"
        )

    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=security.create_access_token(
            user.id, expires_delta=access_token_expires
        )
    )


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token
    """
    return current_user


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """
    Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )
    send_email(
        email_to=user.email,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Password recovery email sent")


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    hashed_password = get_password_hash(password=body.new_password)
    user.hashed_password = hashed_password
    session.add(user)
    session.commit()
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )


@router.get("/verify-email/")
def verify_email(
    token: str,
    session: SessionDep
) -> dict[str, str]:
    email = verify_password_reset_token(token)
    print(email)
    if not email:
        raise HTTPException(status_code=400, detail="无效的验证令牌")

    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    email_verification = session.scalars(
        select(EmailVerification).where(EmailVerification.user_id == user.id)
    ).first()
    if not email_verification:
        raise HTTPException(status_code=404, detail="验证记录不存在")

    # 移除令牌对比逻辑，依赖 verify_password_reset_token 函数验证令牌有效性
    email_verification.is_verified = True
    session.commit()
    return {"message": "邮箱验证成功，请尝试登录"}
