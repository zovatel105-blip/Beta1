import requests, io, json, os

BASE = None
with open('/app/.env') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE = line.strip().split('=', 1)[1]
API = f"{BASE}/api"

def login(username_or_email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"identifier": username_or_email, "password": password})
    if r.status_code != 200:
        # try email field name variants
        r = s.post(f"{API}/auth/login", json={"email": username_or_email, "password": password})
    print("login", username_or_email, r.status_code, r.text[:300])
    return s

def dummy_file():
    return ("test.jpg", io.BytesIO(b"\xff\xd8\xff\xe0" + b"0"*500 + b"\xff\xd9"), "image/jpeg")

def get_user(session, username):
    r = session.get(f"{API}/users/{username}")
    print("get_user", username, r.status_code)
    if r.status_code == 200:
        return r.json().get('user') or r.json()
    return None

marcos = login("marcos", "Test12345")
lucia = login("lucia", "Test12345")

lucia_profile = get_user(marcos, "lucia") or {}
print("lucia_profile", json.dumps(lucia_profile)[:300])

target_author = {
    "id": lucia_profile.get("id"),
    "username": "lucia",
    "name": lucia_profile.get("name") or "lucia",
    "avatarUrl": lucia_profile.get("avatarUrl") or "",
    "verified": False,
}

def create_challenge(message):
    files = {"file": dummy_file()}
    data = {
        "targetAuthor": json.dumps(target_author),
        "targetDescription": "",
        "targetMusic": "",
        "message": message,
    }
    r = marcos.post(f"{API}/challenges", data=data, files=files)
    print("create_challenge", message, r.status_code, r.text[:500])
    return r.json() if r.status_code == 200 else None

def accept_challenge(cid):
    files = {"file": dummy_file()}
    r = lucia.post(f"{API}/challenges/{cid}/accept", files=files)
    print("accept_challenge", cid, r.status_code, r.text[:800])
    return r.json() if r.status_code == 200 else None

print("\n--- Scenario 1: no message ---")
res1 = create_challenge("")
if res1:
    cid = res1['challenge']['id']
    acc1 = accept_challenge(cid)
    if acc1:
        post = acc1['post']
        print("post.description:", repr(post.get('description')))
        print("post.sideA.description:", repr(post.get('sideA', {}).get('description')))
        assert post.get('description') == '', "FAIL: description not empty"
        assert post.get('sideA', {}).get('description') == '', "FAIL: sideA description not empty"
        print("SCENARIO 1 PASS: descriptions are empty")

print("\n--- Scenario 2: with message ---")
res2 = create_challenge("Vamos!")
if res2:
    cid2 = res2['challenge']['id']
    acc2 = accept_challenge(cid2)
    if acc2:
        post2 = acc2['post']
        print("post.description:", repr(post2.get('description')))
        assert post2.get('description') == 'Vamos!', "FAIL: message not preserved"
        print("SCENARIO 2 PASS: message preserved")
