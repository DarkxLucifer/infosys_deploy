import requests, io
import numpy as np
from PIL import Image, ImageDraw

BASE_URL = "http://127.0.0.1:8000/api/v1"

def login(email, password="TestPass123!@#"):
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    token = r.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}, r.cookies

print("=== 1. Login as inspect@infrascan.local ===")
headers_insp, cookies_insp = login("inspect@infrascan.local")
print("Inspector logged in successfully.")

print("\n=== 2. Create Inspection ===")
payload = {
    "asset_id": "BR-018",
    "inspection_method": "walkdown",
    "notes": "Field verification notes V"
}
r = requests.post(f"{BASE_URL}/inspections", json=payload, headers=headers_insp, cookies=cookies_insp)
print(f"Create inspection status: {r.status_code}")
assert r.status_code == 201, f"Expected 201, got {r.status_code}: {r.text}"
new_insp = r.json()
insp_id = new_insp["id"]
print(f"Created inspection ID: {insp_id}, method: {new_insp.get('method')}")

print("\n=== 3. Upload Field Photo as Inspector ===")
# Create a realistic high-resolution textured concrete image (1920x1080) with high contrast patterns
arr = np.random.randint(60, 200, (1080, 1920, 3), dtype=np.uint8)
img = Image.fromarray(arr)
draw = ImageDraw.Draw(img)
# Draw some dark crack lines and features
for x in range(100, 1800, 150):
    draw.line([(x, 100), (x + 80, 900), (x + 120, 1050)], fill=(20, 20, 20), width=6)
    draw.ellipse([x - 20, 400, x + 40, 460], fill=(220, 220, 220))

buf = io.BytesIO()
img.save(buf, format="JPEG", quality=92)
buf.seek(0)

upload_data = {
    "source": "camera",
    "allow_warning": "true",
    "gps_lat": "40.71280",
    "gps_lng": "-74.00600"
}
upload_files = {
    "file": ("field_concrete_inspection.jpg", buf, "image/jpeg")
}
r = requests.post(
    f"{BASE_URL}/inspections/{insp_id}/images",
    data=upload_data,
    files=upload_files,
    headers=headers_insp,
    cookies=cookies_insp
)
print(f"Upload image status: {r.status_code}")
assert r.status_code == 201, f"Upload failed: {r.text}"
uploaded_img = r.json()
img_id = uploaded_img["id"]
print(f"Uploaded Image ID: {img_id}, Status: {uploaded_img.get('status')}")

print("\n=== 4. Cross-Role Visibility: Civil Engineer ===")
headers_eng, cookies_eng = login("engineer@infrascan.local")
r_eng = requests.get(f"{BASE_URL}/inspections/{insp_id}", headers=headers_eng, cookies=cookies_eng)
assert r_eng.status_code == 200, f"Engineer could not get inspection: {r_eng.text}"
print(f"Civil Engineer saw inspection: {r_eng.json()['id']}, status: {r_eng.json()['status']}")

r_eng_imgs = requests.get(f"{BASE_URL}/inspections/{insp_id}/images", headers=headers_eng, cookies=cookies_eng)
assert r_eng_imgs.status_code == 200, f"Engineer could not list images: {r_eng_imgs.text}"
eng_imgs = r_eng_imgs.json()["items"]
print(f"Civil Engineer saw {len(eng_imgs)} images on inspection.")

r_thumb = requests.get(f"{BASE_URL}/images/{img_id}/thumbnail", headers=headers_eng, cookies=cookies_eng)
assert r_thumb.status_code == 200, f"Engineer could not get thumbnail: {r_thumb.status_code}"
print(f"Civil Engineer retrieved thumbnail (bytes: {len(r_thumb.content)})")

print("\n=== 5. Cross-Role Visibility: Infrastructure Manager ===")
headers_mgr, cookies_mgr = login("manager@infrascan.local")
r_mgr = requests.get(f"{BASE_URL}/inspections/{insp_id}", headers=headers_mgr, cookies=cookies_mgr)
assert r_mgr.status_code == 200, f"Manager could not get inspection: {r_mgr.text}"
print(f"Manager saw inspection: {r_mgr.json()['id']}, status: {r_mgr.json()['status']}")

r_mgr_imgs = requests.get(f"{BASE_URL}/inspections/{insp_id}/images", headers=headers_mgr, cookies=cookies_mgr)
assert r_mgr_imgs.status_code == 200, f"Manager could not list images: {r_mgr_imgs.text}"
print(f"Manager saw {len(r_mgr_imgs.json()['items'])} images on inspection.")

r_mgr_thumb = requests.get(f"{BASE_URL}/images/{img_id}/thumbnail", headers=headers_mgr, cookies=cookies_mgr)
assert r_mgr_thumb.status_code == 200, f"Manager could not get thumbnail: {r_mgr_thumb.status_code}"
print(f"Manager retrieved thumbnail (bytes: {len(r_mgr_thumb.content)})")

print("\n=== 6. Cross-Role Visibility: Maintenance Engineer ===")
headers_maint, cookies_maint = login("maintenance@infrascan.local")
r_maint = requests.get(f"{BASE_URL}/inspections/{insp_id}", headers=headers_maint, cookies=cookies_maint)
assert r_maint.status_code == 200, f"Maintenance could not get inspection: {r_maint.text}"
print(f"Maintenance saw inspection: {r_maint.json()['id']}, status: {r_maint.json()['status']}")

r_maint_imgs = requests.get(f"{BASE_URL}/inspections/{insp_id}/images", headers=headers_maint, cookies=cookies_maint)
assert r_maint_imgs.status_code == 200, f"Maintenance could not list images: {r_maint_imgs.text}"
print(f"Maintenance saw {len(r_maint_imgs.json()['items'])} images on inspection.")

r_maint_thumb = requests.get(f"{BASE_URL}/images/{img_id}/thumbnail", headers=headers_maint, cookies=cookies_maint)
assert r_maint_thumb.status_code == 200, f"Maintenance could not get thumbnail: {r_maint_thumb.status_code}"
print(f"Maintenance retrieved thumbnail (bytes: {len(r_maint_thumb.content)})")

print("\n=== 7. Verify Asset Detail includes new inspection for all roles ===")
for role_name, h, c in [
    ("Inspector", headers_insp, cookies_insp),
    ("Engineer", headers_eng, cookies_eng),
    ("Manager", headers_mgr, cookies_mgr),
    ("Maintenance", headers_maint, cookies_maint)
]:
    r_asset_insps = requests.get(f"{BASE_URL}/inspections?asset_id=BR-018", headers=h, cookies=c)
    assert r_asset_insps.status_code == 200
    insps = r_asset_insps.json()["items"]
    found = any(i["id"] == insp_id for i in insps)
    print(f"[{role_name}] Found new inspection on asset BR-018: {found} (total on asset: {len(insps)})")

print("\n=======================================================")
print("ALL TESTS PASSED! End-to-end multi-role pipeline verified.")
print("=======================================================")
