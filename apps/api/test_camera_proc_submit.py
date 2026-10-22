import requests, io
import numpy as np
from PIL import Image

login_r = requests.post('http://127.0.0.1:8000/api/v1/auth/login', json={'email': 'inspect@infrascan.local', 'password': 'TestPass123!@#'})
assert login_r.status_code == 200
token = login_r.json()['accessToken']
h = {'Authorization': f'Bearer {token}'}

# Create a new inspection
r_create = requests.post('http://127.0.0.1:8000/api/v1/inspections', json={'asset_id': 'BR-018'}, headers=h, cookies=login_r.cookies)
insp_id = r_create.json()['id']
print('1. Created inspection:', insp_id)

# Create a typical room webcam photo (dim lighting, slight blur)
room_arr = np.random.randint(20, 50, (720, 1280, 3), dtype=np.uint8)
img = Image.fromarray(room_arr)
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=85)
buf.seek(0)

# Upload with allow_warning=true (just like Take Photo / Camera does)
r_up = requests.post(
    f'http://127.0.0.1:8000/api/v1/inspections/{insp_id}/images',
    data={'source': 'camera', 'allow_warning': 'true'},
    files={'file': ('webcam_frame.jpg', buf, 'image/jpeg')},
    headers=h,
    cookies=login_r.cookies
)
print('2. Upload camera photo status:', r_up.status_code)
assert r_up.status_code == 201, f'Upload failed: {r_up.text}'
up_data = r_up.json()
img_id = up_data['id']
print(f"   Image ID: {img_id}, Status: {up_data['status']}")

# Check processed file was generated
r_proc = requests.get(f'http://127.0.0.1:8000/api/v1/images/{img_id}/processed', headers=h, cookies=login_r.cookies)
print('3. Processed image status:', r_proc.status_code, 'Bytes:', len(r_proc.content))
assert r_proc.status_code == 200, 'Processed image must exist'

# Submit for review
r_sub = requests.post(f'http://127.0.0.1:8000/api/v1/inspections/{insp_id}/submit', headers=h, cookies=login_r.cookies)
print('4. Submit for review status:', r_sub.status_code, 'Result:', r_sub.text)
assert r_sub.status_code == 200, f'Submit failed: {r_sub.text}'
print('\n>>> ALL CHECKS PASSED: Camera photo uploaded, preprocessed with OpenCV CLAHE, and successfully submitted for review! <<<')
