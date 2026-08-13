#!/usr/bin/env python3
"""
Backend smoke test for regression verification after native Android fix.

This test does NOT verify the native Jetpack Compose bug (Profile.kt click-through).
It only confirms that the shared Next.js backend remains healthy after the fix.

The native bug (tapping empty spaces in header/tab bar opening posts from grid below)
requires Android SDK + emulator to verify - not testable in this environment.
"""

import requests
import sys

# Base URL from .env
BASE_URL = "https://single-post-concept.preview.emergentagent.com/api"

def test_login():
    """Test 1: POST /api/auth/login with lucia/Test12345"""
    print("\n[TEST 1] POST /api/auth/login (lucia/Test12345)")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={
                "username": "lucia",
                "password": "Test12345"
            },
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') and data.get('user', {}).get('username') == 'lucia':
                print(f"  ✅ PASS: Login successful, user={data['user']['username']}")
                return True, response.cookies
            else:
                print(f"  ❌ FAIL: Unexpected response: {data}")
                return False, None
        else:
            print(f"  ❌ FAIL: Status {response.status_code}: {response.text}")
            return False, None
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False, None

def test_user_profile(cookies):
    """Test 2: GET /api/users/luxury (profile with 19 posts)"""
    print("\n[TEST 2] GET /api/users/luxury (profile with posts)")
    
    try:
        headers = {}
        if cookies:
            # Extract token from cookies if available
            token = cookies.get('token')
            if token:
                headers['Authorization'] = f"Bearer {token}"
        
        response = requests.get(
            f"{BASE_URL}/users/luxury",
            headers=headers,
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            posts = data.get('posts', [])
            print(f"  ✅ PASS: Profile loaded, posts={len(posts)}")
            return True
        else:
            print(f"  ❌ FAIL: Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_feed():
    """Test 3: GET /api/feed?cursor=0&limit=8"""
    print("\n[TEST 3] GET /api/feed?cursor=0&limit=8")
    
    try:
        response = requests.get(
            f"{BASE_URL}/feed?cursor=0&limit=8",
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            posts = data.get('posts', [])
            has_more = data.get('hasMore', False)
            print(f"  ✅ PASS: Feed loaded, posts={len(posts)}, hasMore={has_more}")
            return True
        else:
            print(f"  ❌ FAIL: Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def test_uploads():
    """Test 4: GET /api/uploads"""
    print("\n[TEST 4] GET /api/uploads")
    
    try:
        response = requests.get(
            f"{BASE_URL}/uploads",
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            posts = data.get('posts', [])
            print(f"  ✅ PASS: Uploads loaded, posts={len(posts)}")
            return True
        else:
            print(f"  ❌ FAIL: Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print(f"  ❌ FAIL: Exception: {e}")
        return False

def main():
    print("=" * 80)
    print("BACKEND SMOKE TEST - Regression Check After Native Android Fix")
    print("=" * 80)
    print("\nIMPORTANT: This test does NOT verify the native Jetpack Compose bug.")
    print("The bug (Profile.kt click-through) requires Android SDK + emulator.")
    print("This only confirms the shared Next.js backend remains healthy.\n")
    print("=" * 80)
    
    results = []
    
    # Test 1: Login
    success, cookies = test_login()
    results.append(("POST /api/auth/login", success))
    
    # Test 2: User profile
    success = test_user_profile(cookies)
    results.append(("GET /api/users/luxury", success))
    
    # Test 3: Feed
    success = test_feed()
    results.append(("GET /api/feed", success))
    
    # Test 4: Uploads
    success = test_uploads()
    results.append(("GET /api/uploads", success))
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    all_passed = True
    for endpoint, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}: {endpoint}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 80)
    if all_passed:
        print("✅ ALL SMOKE TESTS PASSED")
        print("=" * 80)
        print("\nBackend is healthy. No regression detected.")
        print("\nNote: The native Android bug (Profile.kt click-through) cannot be")
        print("verified in this environment. User must compile APK and test manually.")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("=" * 80)
        print("\nBackend regression detected. Investigation needed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
