import logging
from email.message import EmailMessage
import aiosmtplib
from app.config import settings

logger = logging.getLogger("infrascan.email")

async def send_email(to_email: str, subject: str, plain_content: str, html_content: str = None) -> bool:
    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(plain_content)
    
    if html_content:
        message.add_alternative(html_content, subtype="html")
    
    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=settings.SMTP_STARTTLS,
            timeout=5.0,
        )
        logger.info(f"Email sent successfully to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.warning(f"Could not send email to {to_email} via SMTP ({settings.SMTP_HOST}:{settings.SMTP_PORT}): {e}")
        return False

async def send_verification_email(email: str, token: str):
    link = f"{settings.APP_BASE_URL}/verify-email?token={token}"
    plain = f"Welcome to InfraScan.\n\nPlease verify your email by opening the link:\n{link}\n\nThis link will expire in 24 hours."
    html = f"""
    <div style="font-family: sans-serif; max-width: 600px; padding: 24px; color: #050315;">
      <h2 style="color: #2f27ce;">InfraScan — Email Verification</h2>
      <p>Thank you for registering. Please click the button below to verify your work email address:</p>
      <p><a href="{link}" style="display: inline-block; padding: 12px 24px; background: #2f27ce; color: #fbfbfe; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify Email Address</a></p>
      <p style="font-size: 12px; color: #55526e;">Link expires in 24 hours. After verification, an administrator will review your access request.</p>
    </div>
    """
    return await send_email(email, "Verify your InfraScan email address", plain, html)

async def send_password_reset_email(email: str, token: str):
    link = f"{settings.APP_BASE_URL}/reset-password?token={token}"
    plain = f"A password reset was requested for your InfraScan account.\n\nReset your password here:\n{link}\n\nThis link expires in 60 minutes."
    html = f"""
    <div style="font-family: sans-serif; max-width: 600px; padding: 24px; color: #050315;">
      <h2 style="color: #2f27ce;">InfraScan — Password Reset</h2>
      <p>A password reset was requested for your account. Click below to choose a new password:</p>
      <p><a href="{link}" style="display: inline-block; padding: 12px 24px; background: #2f27ce; color: #fbfbfe; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a></p>
      <p style="font-size: 12px; color: #55526e;">This link expires in 60 minutes. If you did not request this, you can ignore this email.</p>
    </div>
    """
    return await send_email(email, "Reset your InfraScan password", plain, html)

async def send_account_approved_email(email: str, role: str):
    link = f"{settings.APP_BASE_URL}/login"
    plain = f"Your InfraScan account has been approved by an administrator with the role: {role}.\n\nYou may now log in:\n{link}"
    return await send_email(email, "Your InfraScan account has been approved", plain)

async def send_account_rejected_email(email: str, reason: str = ""):
    plain = f"Your InfraScan access request could not be approved at this time.\n\nReason: {reason or 'Access criteria not met'}"
    return await send_email(email, "InfraScan account application status", plain)

async def send_account_locked_email(email: str):
    link = f"{settings.APP_BASE_URL}/forgot-password"
    plain = f"Your InfraScan account was temporarily locked after multiple failed sign-in attempts.\n\nIt will unlock automatically in 15 minutes, or you can reset your password immediately here:\n{link}"
    return await send_email(email, "Security Alert: Account Temporarily Locked", plain)

async def send_invitation_email(email: str, role: str, token: str):
    link = f"{settings.APP_BASE_URL}/accept-invite?token={token}"
    plain = f"You have been invited to join InfraScan as a {role}.\n\nActivate your account here:\n{link}"
    return await send_email(email, f"Invitation to join InfraScan as {role}", plain)
