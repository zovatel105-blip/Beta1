#!/usr/bin/env python3
"""
Backend Regression Smoke Test - Post AudioReactiveRings Frontend Fix
Tests 5 critical endpoints to ensure backend still responds normally.
"""

import requests
import sys

BASE_URL = "https://record-player-ui-1.preview.emergentagent.com/api"

def test_login():
    """Test 1: POST /api/auth/login with lucia/Test12345"""
    print("\n=== TEST 1: POST /api/auth/login ===")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": "lucia", "password": "Test12345"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return None
        
        data = response.json()
        if not data.get("ok"):
            print(f"❌ FAIL: Response ok=false")
            print(f"Response: {data}")
            return None
        
        token = data.get("token")
        if not token:
            print(f"❌ FAIL: No token in response")
            return None
        
        # Check for session_token cookie
        cookies = response.cookies
        if "session_token" not in cookies:
            print(f"❌ FAIL: No session_token cookie set")
            return None
        
        print(f"✅ PASS: Login successful, token={token[:20]}..., cookie set")
        return {"token": token, "cookie": cookies.get("session_token")}
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return None

def test_feed():
    """Test 2: GET /api/feed?cursor=0&limit=8"""
    print("\n=== TEST 2: GET /api/feed?cursor=0&limit=8 ===")
    try:
        response = requests.get(
            f"{BASE_URL}/feed",
            params={"cursor": 0, "limit": 8},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        if "posts" not in data:
            print(f"❌ FAIL: No 'posts' field in response")
            print(f"Response: {data}")
            return False
        
        if "nextCursor" not in data:
            print(f"❌ FAIL: No 'nextCursor' field in response")
            return False
        
        if "hasMore" not in data:
            print(f"❌ FAIL: No 'hasMore' field in response")
            return False
        
        print(f"✅ PASS: Feed returned {len(data['posts'])} posts, nextCursor={data['nextCursor']}, hasMore={data['hasMore']}")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_uploads():
    """Test 3: GET /api/uploads"""
    print("\n=== TEST 3: GET /api/uploads ===")
    try:
        response = requests.get(f"{BASE_URL}/uploads", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        if "posts" not in data:
            print(f"❌ FAIL: No 'posts' field in response")
            print(f"Response: {data}")
            return False
        
        print(f"✅ PASS: Uploads returned {len(data['posts'])} posts")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_challenges(auth):
    """Test 4: GET /api/challenges (with lucia's session)"""
    print("\n=== TEST 4: GET /api/challenges (authenticated) ===")
    if not auth:
        print("❌ SKIP: No auth from login test")
        return False
    
    try:
        # Test with Bearer token
        response = requests.get(
            f"{BASE_URL}/challenges",
            headers={"Authorization": f"Bearer {auth['token']}"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        if "challenges" not in data:
            print(f"❌ FAIL: No 'challenges' field in response")
            print(f"Response: {data}")
            return False
        
        print(f"✅ PASS: Challenges returned {len(data['challenges'])} challenges")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def test_notifications(auth):
    """Test 5: GET /api/notifications/unread (with lucia's session)"""
    print("\n=== TEST 5: GET /api/notifications/unread (authenticated) ===")
    if not auth:
        print("❌ SKIP: No auth from login test")
        return False
    
    try:
        # Test with Bearer token
        response = requests.get(
            f"{BASE_URL}/notifications/unread",
            headers={"Authorization": f"Bearer {auth['token']}"},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAIL: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        if "count" not in data:
            print(f"❌ FAIL: No 'count' field in response")
            print(f"Response: {data}")
            return False
        
        print(f"✅ PASS: Notifications unread count={data['count']}")
        return True
        
    except Exception as e:
        print(f"❌ FAIL: Exception - {e}")
        return False

def main():
    print("=" * 70)
    print("BACKEND REGRESSION SMOKE TEST")
    print("Post AudioReactiveRings.jsx Frontend Fix")
    print("=" * 70)
    
    results = {}
    
    # Test 1: Login
    auth = test_login()
    results["login"] = auth is not None
    
    # Test 2: Feed (no auth required)
    results["feed"] = test_feed()
    
    # Test 3: Uploads (no auth required)
    results["uploads"] = test_uploads()
    
    # Test 4: Challenges (requires auth)
    results["challenges"] = test_challenges(auth)
    
    # Test 5: Notifications (requires auth)
    results["notifications"] = test_notifications(auth)
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_flag in results.items():
        status = "✅ PASS" if passed_flag else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - Backend regression check successful!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total - passed} test(s) failed - Backend may have issues")
        sys.exit(1)

if __name__ == "__main__":
    main()
