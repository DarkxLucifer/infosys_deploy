from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16,
)

COMMON_PASSWORDS = {
    "password1234", "administrator", "infrascan123", "welcome12345",
    "letmein12345", "123456789012", "qwertyuiop12", "passwords123"
}

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False

def validate_password_strength(password: str, user_name: str = "", user_email: str = "") -> tuple[bool, str]:
    if len(password) < 12:
        return False, "Password must be at least 12 characters long."
    if len(password) > 128:
        return False, "Password cannot exceed 128 characters."
    
    low = password.lower()
    if any(common in low for common in COMMON_PASSWORDS):
        return False, "Password contains easily-guessed common patterns."
    
    if user_name and len(user_name) > 3 and user_name.lower().split()[0] in low:
        return False, "Password cannot contain parts of your name."
    
    if user_email and len(user_email) > 3 and user_email.lower().split("@")[0] in low:
        return False, "Password cannot contain your email username."
    
    return True, ""
