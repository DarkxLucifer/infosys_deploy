import sqlite3
conn = sqlite3.connect(r'D:\project\aiml prime\project\infosys\apps\api\infrascan_dev.db')
cursor = conn.cursor()
tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables:", tables)

for t in ["users", "user_credentials", "user_passwords", "auth_credentials"]:
    if t in tables:
        print(f"\nTable {t}:")
        cols = [r[1] for r in cursor.execute(f"PRAGMA table_info({t})").fetchall()]
        print("  Cols:", cols)
        rows = cursor.execute(f"SELECT * FROM {t}").fetchall()
        for r in rows:
            print("  Row:", r)
