import sys
from pathlib import Path

# Add apps/api to sys.path so 'app' can be imported anywhere
api_dir = Path(__file__).resolve().parent.parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))
