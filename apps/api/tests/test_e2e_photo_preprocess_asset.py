import requests
import io
import numpy as np
from PIL import Image

BASE_URL = "http://127.0.0.1:8000/api/v1"

def create_synthetic_crack_image():
    # 800x600 high contrast image with line simulating crack
    arr = np.full((600, 800, 3), 180, dtype=np.uint8)
    # Add texture
    noise = np.random.randint(-20, 20, (600, 800, 3), dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    # Draw dark jagged crack line
    for x in range(100, 700):
        y = int(300 + 40 * np.sin(x / 50.0) + np.random.randint(-3, 3))
        arr[y-2:y+3, x, :] = 30
    
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()

def run_tests():
    session = requests.Session()

    print("\n--- STEP 1: Login as Inspector ---")
    login_res = session.post(f"{BASE_URL}/auth/login", json={
        "email": "inspector@infrascan.local",
        "password": "TestPass123!@#"
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token_inspector = login_res.json().get("accessToken") or login_res.json().get("access_token")
    headers_inspector = {"Authorization": f"Bearer {token_inspector}"}
    print("Inspector authenticated successfully.")

    print("\n--- STEP 2: Inspector registers asset with GPS and minimal fields ---")
    # Only Name, Type, and GPS coordinates provided (all other fields omitted)
    asset_res = session.post(f"{BASE_URL}/assets", headers=headers_inspector, json={
        "name": "Hudson Overpass Pier 4",
        "asset_type": "bridge",
        "latitude": 40.7306,
        "longitude": -73.9352
    })
    assert asset_res.status_code == 201, f"Asset creation failed: {asset_res.text}"
    asset_data = asset_res.json()
    asset_id = asset_data["id"]
    print(f"Created Asset ID: {asset_id}, Name: {asset_data['name']}, Address: {asset_data['address']}")
    assert asset_data["latitude"] == 40.7306
    assert asset_data["longitude"] == -73.9352

    print("\n--- STEP 3: Inspector creates inspection for the new asset ---")
    # Only asset_id provided; all other dates/inspector fields auto-defaulted
    insp_res = session.post(f"{BASE_URL}/inspections", headers=headers_inspector, json={
        "asset_id": asset_id,
        "notes": "Field camera capture with GPS tagging"
    })
    assert insp_res.status_code == 201, f"Inspection creation failed: {insp_res.text}"
    insp_data = insp_res.json()
    insp_id = insp_data["id"]
    print(f"Created Inspection ID: {insp_id}, Status: {insp_data['status']}")

    print("\n--- STEP 4: Inspector uploads photo from camera with GPS ---")
    img_bytes = create_synthetic_crack_image()
    upload_res = session.post(
        f"{BASE_URL}/inspections/{insp_id}/images",
        headers=headers_inspector,
        files={"file": ("field_camera_frame_01.jpg", img_bytes, "image/jpeg")},
        data={
            "source": "smartphone",
            "allow_warning": "true",
            "gps_lat": "40.73061",
            "gps_lng": "-73.93524"
        }
    )
    assert upload_res.status_code == 201, f"Upload failed: {upload_res.text}"
    img_data = upload_res.json()
    img_id = img_data["id"]
    print(f"Uploaded Image ID: {img_id}, Status: {img_data['status']}, Resolution: {img_data['width']}x{img_data['height']}")

    print("\n--- STEP 5: Verify preprocessed image is available ---")
    proc_res = session.get(f"{BASE_URL}/images/{img_id}/processed", headers=headers_inspector)
    assert proc_res.status_code == 200, f"Get processed image failed: {proc_res.status_code}"
    assert len(proc_res.content) > 0
    print(f"Retrieved Preprocessed Image bytes ({len(proc_res.content)} bytes, Content-Type: {proc_res.headers.get('content-type')})")

    # Also test alias route
    alias_res = session.get(f"{BASE_URL}/inspections/{insp_id}/images/{img_id}/processed", headers=headers_inspector)
    assert alias_res.status_code == 200, f"Alias processed route failed: {alias_res.status_code}"
    print("Alias route /inspections/{id}/images/{img_id}/processed verified.")

    print("\n--- STEP 6: Manual trigger Preprocessing endpoint ---")
    manual_prep_res = session.post(
        f"{BASE_URL}/images/{img_id}/preprocess",
        headers=headers_inspector,
        json={"profile_name": "standard_crack_enhancement"}
    )
    assert manual_prep_res.status_code == 200, f"Manual preprocessing failed: {manual_prep_res.text}"
    prep_info = manual_prep_res.json()
    print(f"Preprocessing applied steps: {prep_info['stepsApplied']}")

    print("\n--- STEP 7: Submit Inspection for Civil Engineer review ---")
    submit_res = session.post(f"{BASE_URL}/inspections/{insp_id}/submit", headers=headers_inspector)
    assert submit_res.status_code == 200, f"Submit inspection failed: {submit_res.text}"
    print("Inspection submitted for review. Status transitioned to pending_review.")

    print("\n--- STEP 8: Civil Engineer logs in and accesses the Asset and Inspection ---")
    login_eng = session.post(f"{BASE_URL}/auth/login", json={
        "email": "engineer@infrascan.local",
        "password": "TestPass123!@#"
    })
    assert login_eng.status_code == 200, f"Engineer login failed: {login_eng.text}"
    token_eng = login_eng.json().get("accessToken") or login_eng.json().get("access_token")
    headers_eng = {"Authorization": f"Bearer {token_eng}"}

    # Fetch Asset detail as Engineer
    eng_asset_res = session.get(f"{BASE_URL}/assets/{asset_id}", headers=headers_eng)
    assert eng_asset_res.status_code == 200, f"Engineer asset access failed: {eng_asset_res.text}"
    eng_asset = eng_asset_res.json()
    print(f"Civil Engineer retrieved Asset: {eng_asset['name']} (ID: {eng_asset['id']})")
    assert len(eng_asset["inspections"]) >= 1, "Inspection not listed in asset for Engineer"
    print(f"Inspections listed under Asset: {[i['id'] for i in eng_asset['inspections']]}")

    # Fetch Images as Engineer
    eng_imgs_res = session.get(f"{BASE_URL}/inspections/{insp_id}/images", headers=headers_eng)
    assert eng_imgs_res.status_code == 200, f"Engineer images access failed: {eng_imgs_res.text}"
    eng_imgs = eng_imgs_res.json()
    assert eng_imgs["totalImages"] >= 1, "No images found for inspection"
    print(f"Civil Engineer retrieved {eng_imgs['totalImages']} inspection imagery asset(s).")

    print("\n--- STEP 9: Infrastructure Manager logs in and verifies Asset visibility ---")
    login_mgr = session.post(f"{BASE_URL}/auth/login", json={
        "email": "manager@infrascan.local",
        "password": "TestPass123!@#"
    })
    assert login_mgr.status_code == 200, f"Manager login failed: {login_mgr.text}"
    token_mgr = login_mgr.json().get("accessToken") or login_mgr.json().get("access_token")
    headers_mgr = {"Authorization": f"Bearer {token_mgr}"}

    mgr_asset_res = session.get(f"{BASE_URL}/assets/{asset_id}", headers=headers_mgr)
    assert mgr_asset_res.status_code == 200, f"Manager asset access failed: {mgr_asset_res.text}"
    mgr_asset = mgr_asset_res.json()
    print(f"Infrastructure Manager retrieved Asset: {mgr_asset['name']}, GPS: ({mgr_asset['latitude']}, {mgr_asset['longitude']})")

    print("\n=======================================================")
    print("ALL END-TO-END PHOTOGRAPHY & PREPROCESSING TESTS PASSED!")
    print("=======================================================\n")

if __name__ == "__main__":
    run_tests()
