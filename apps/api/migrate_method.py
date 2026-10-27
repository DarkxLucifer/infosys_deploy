import sqlite3, os

for dbpath in ['D:/project/aiml prime/project/infosys/apps/api/infrascan_dev.db', 'D:/project/aiml prime/project/infosys/infrascan_dev.db', 'D:/project/aiml prime/infrascan_dev.db']:
    if os.path.exists(dbpath):
        conn = sqlite3.connect(dbpath)
        cols = [r[1] for r in conn.cursor().execute('PRAGMA table_info(inspections)').fetchall()]
        if 'method' not in cols:
            conn.cursor().execute("ALTER TABLE inspections ADD COLUMN method VARCHAR(32) DEFAULT 'walkdown'")
            conn.commit()
            print(f"Added method column to {dbpath}")
        else:
            print(f"method column already exists in {dbpath}")
print("Done")
