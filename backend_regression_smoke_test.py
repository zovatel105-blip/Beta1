#!/usr/bin/env python3
"""
Backend regression smoke test after frontend-only CSS fix (touch-action in SettingsDrawer).
Tests 5 critical endpoints to confirm no backend regressions.
"""
import requests
import sys

BASE_URL = "https://social-interact-5.preview.emergentagent.com/api"

def test_backend_regression():
    print("=" * 80)
    print("BACKEND REGRESSION SMOKE TEST")
    print("Context: Frontend-only CSS fix (touch-action in ProfilePage.jsx)")
    print("Goal: Confirm backend still responds normally (no 500 errors)")
    print("=" * 80)
    
    all_passed = True
    
    # TEST 1: Login with lucia/Test12345
    print("\n[TEST 1] POST /api/auth/login (lucia/Test12345)")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": "lucia", "password": "Test12345"},
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            has_token = "token" in data and data["token"]
            has_cookie = "session_token" in response.cookies
            print(f"  ✓ 200 OK")
            print(f"  ✓ Token present: {has_token}")
            print(f"  ✓ Cookie session_token: {has_cookie}")
            
            if not has_token or not has_cookie:
                print("  ✗ FAIL: Missing token or cookie")
                all_passed = False
            else:
                print("  ✅ PASS")
                # Save token and cookie for subsequent tests
                token = data["token"]
                session_cookie = response.cookies.get("session_token")
        else:
            print(f"  ✗ FAIL: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            all_passed = False
            return all_passed
    except Exception as e:
        print(f"  ✗ FAIL: Exception - {e}")
        all_passed = False
        return all_passed
    
    # TEST 2: GET /api/feed?cursor=0&limit=8
    print("\n[TEST 2] GET /api/feed?cursor=0&limit=8")
    try:
        response = requests.get(
            f"{BASE_URL}/feed?cursor=0&limit=8",
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            has_posts = "posts" in data
            has_next_cursor = "nextCursor" in data
            has_more = "hasMore" in data
            print(f"  ✓ 200 OK")
            print(f"  ✓ Has 'posts': {has_posts}")
            print(f"  ✓ Has 'nextCursor': {has_next_cursor}")
            print(f"  ✓ Has 'hasMore': {has_more}")
            
            if has_posts and has_next_cursor and has_more is not None:
                print(f"  ✅ PASS (posts count: {len(data.get('posts', []))})")
            else:
                print("  ✗ FAIL: Missing required fields")
                all_passed = False
        else:
            print(f"  ✗ FAIL: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            all_passed = False
    except Exception as e:
        print(f"  ✗ FAIL: Exception - {e}")
        all_passed = False
    
    # TEST 3: GET /api/uploads
    print("\n[TEST 3] GET /api/uploads")
    try:
        response = requests.get(
            f"{BASE_URL}/uploads",
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            has_posts = "posts" in data
            print(f"  ✓ 200 OK")
            print(f"  ✓ Has 'posts': {has_posts}")
            
            if has_posts:
                print(f"  ✅ PASS (posts count: {len(data.get('posts', []))})")
            else:
                print("  ✗ FAIL: Missing 'posts' field")
                all_passed = False
        else:
            print(f"  ✗ FAIL: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            all_passed = False
    except Exception as e:
        print(f"  ✗ FAIL: Exception - {e}")
        all_passed = False
    
    # TEST 4: GET /api/challenges (with lucia session)
    print("\n[TEST 4] GET /api/challenges (authenticated as lucia)")
    try:
        response = requests.get(
            f"{BASE_URL}/challenges",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            has_challenges = "challenges" in data
            print(f"  ✓ 200 OK")
            print(f"  ✓ Has 'challenges': {has_challenges}")
            
            if has_challenges:
                print(f"  ✅ PASS (challenges count: {len(data.get('challenges', []))})")
            else:
                print("  ✗ FAIL: Missing 'challenges' field")
                all_passed = False
        else:
            print(f"  ✗ FAIL: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            all_passed = False
    except Exception as e:
        print(f"  ✗ FAIL: Exception - {e}")
        all_passed = False
    
    # TEST 5: GET /api/notifications/unread (with lucia session)
    print("\n[TEST 5] GET /api/notifications/unread (authenticated as lucia)")
    try:
        response = requests.get(
            f"{BASE_URL}/notifications/unread",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            has_count = "count" in data
            print(f"  ✓ 200 OK")
            print(f"  ✓ Has 'count': {has_count}")
            
            if has_count:
                print(f"  ✅ PASS (unread count: {data.get('count', 0)})")
            else:
                print("  ✗ FAIL: Missing 'count' field")
                all_passed = False
        else:
            print(f"  ✗ FAIL: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            all_passed = False
    except Exception as e:
        print(f"  ✗ FAIL: Exception - {e}")
        all_passed = False
    
    # Summary
    print("\n" + "=" * 80)
    if all_passed:
        print("✅ ALL TESTS PASSED (5/5)")
        print("Backend is responding normally after frontend CSS fix.")
        print("No 500 errors detected.")
    else:
        print("❌ SOME TESTS FAILED")
        print("Backend may have regressions (or expected behavior changed).")
    print("=" * 80)
    
    return all_passed

if __name__ == "__main__":
    success = test_backend_regression()
    sys.exit(0 if success else 1)
