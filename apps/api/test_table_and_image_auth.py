import requests

BASE_URL = "http://127.0.0.1:8000/api/v1"

print("=== 1. Test Login & Cookie Issuance ===")
login_r = requests.post(f"{BASE_URL}/auth/login", json={"email": "inspect@infrascan.local", "password": "TestPass123!@#"})
assert login_r.status_code == 200, f"Login failed: {login_r.text}"
token = login_r.json()["accessToken"]
cookies = login_r.cookies
print(f"Login successful. Cookies received: {list(cookies.keys())}")
assert "infrascan_refresh" in cookies
assert "infrascan_access" in cookies
print("Both infrascan_refresh and infrascan_access cookies are set!")

print("\n=== 2. Test GET /inspections (Inspector role) ===")
# Inspector listing network inspections
r_list = requests.get(f"{BASE_URL}/inspections?page_size=100", headers={"Authorization": f"Bearer {token}"}, cookies=cookies)
assert r_list.status_code == 200
items = r_list.json()["items"]
print(f"Inspector retrieved {len(items)} inspections (full organization view).")
assert len(items) >= 10, f"Expected >= 10 inspections, got {len(items)}"
first = items[0]
print(f"Top inspection: ID={first['id']}, Asset={first.get('assetName')}, Photos={first.get('imageCount')}, Status={first.get('status')}")

print("\n=== 3. Test GET /inspections (Engineer & Manager roles) ===")
for role_email in ["engineer@infrascan.local", "manager@infrascan.local", "maintenance@infrascan.local"]:
    r_l = requests.post(f"{BASE_URL}/auth/login", json={"email": role_email, "password": "TestPass123!@#"})
    t = r_l.json()["accessToken"]
    r_check = requests.get(f"{BASE_URL}/inspections?page_size=100", headers={"Authorization": f"Bearer {t}"}, cookies=r_l.cookies)
    assert r_check.status_code == 200
    print(f"[{role_email}] sees {len(r_check.json()['items'])} inspections.")

print("\n=== 4. Test HTML <img> Tag Authentication (Cookie Only, No Authorization Header) ===")
# Find an inspection with images
insp_with_img = next((i for i in items if i.get("imageCount", 0) > 0), None)
assert insp_with_img is not None, "At least one inspection must have images"
r_imgs = requests.get(f"{BASE_URL}/inspections/{insp_with_img['id']}/images", headers={"Authorization": f"Bearer {token}"}, cookies=cookies)
img_id = r_imgs.json()["items"][0]["id"]

# Browser GET without Authorization header (only cookies, like <img src="..."> does)
r_img_cookie = requests.get(f"{BASE_URL}/images/{img_id}/file", cookies=cookies)
print(f"Image fetch (cookie only): Status={r_img_cookie.status_code}, Bytes={len(r_img_cookie.content)}")
assert r_img_cookie.status_code == 200, f"Expected 200, got {r_img_cookie.status_code}"

# Thumbnail fetch (cookie only)
r_thumb_cookie = requests.get(f"{BASE_URL}/images/{img_id}/thumbnail", cookies=cookies)
print(f"Thumbnail fetch (cookie only): Status={r_thumb_cookie.status_code}, Bytes={len(r_thumb_cookie.content)}")
assert r_thumb_cookie.status_code == 200, f"Expected 200, got {r_thumb_cookie.status_code}"

print("\n=== 5. Test Query Parameter Token Authentication (?token=...) ===")
# Pure query param without cookies or auth headers
r_query_img = requests.get(f"{BASE_URL}/images/{img_id}/file?token={token}")
print(f"Image fetch (?token=...): Status={r_query_img.status_code}, Bytes={len(r_query_img.content)}")
assert r_query_img.status_code == 200

r_query_proc = requests.get(f"{BASE_URL}/images/{img_id}/processed?token={token}")
print(f"Processed image fetch (?token=...): Status={r_query_proc.status_code}, Bytes={len(r_query_proc.content)}")
assert r_query_proc.status_code == 200

print("\n=================================================================")
print("ALL 5 VERIFICATIONS PASSED! Real-time table & image access verified.")
print("=================================================================")
