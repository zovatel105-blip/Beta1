#!/usr/bin/env python3
"""
Smoke test for Next.js backend - regression check only.
This test does NOT verify the Android native audio bug (not testable in this environment).
It only confirms the shared backend APIs are still healthy after the Android-only fix.
"""

import requests
import sys

BASE_URL = "https://app-identity-config.preview.emergentagent.com/api"

def test_smoke():
    """Run smoke test of core backend endpoints"""
    
    print("=" * 80)
    print("BACKEND SMOKE TEST - Regression Check Only")
    print("=" * 80)
    print()
    print("NOTE: This test does NOT verify the Android native audio bug.")
    print("It only confirms no accidental regression in the shared Next.js backend.")
    print()
    
    session_token = None
    cookie_header = None
    
    # Test 1: POST /api/auth/login with lucia/Test12345
    print("[TEST 1] POST /api/auth/login (lucia/Test12345)")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": "lucia", "password": "Test12345"},
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response: ok={data.get('ok')}, user={data.get('user', {}).get('username')}")
            
            # Extract session token from response or cookie
            if 'token' in data:
                session_token = data['token']
            
            # Extract cookie
            if 'set-cookie' in response.headers:
                cookie_header = response.headers['set-cookie']
            elif response.cookies.get('session_token'):
                cookie_header = f"session_token={response.cookies.get('session_token')}"
            
            print(f"  ✅ PASS - Login successful")
        else:
            print(f"  ❌ FAIL - Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
    except Exception as e:
        print(f"  ❌ FAIL - Exception: {e}")
    
    print()
    
    # Test 2: GET /api/feed?cursor=0&limit=8
    print("[TEST 2] GET /api/feed?cursor=0&limit=8")
    try:
        headers = {}
        if session_token:
            headers['Authorization'] = f'Bearer {session_token}'
        if cookie_header:
            headers['Cookie'] = cookie_header
            
        response = requests.get(
            f"{BASE_URL}/feed?cursor=0&limit=8",
            headers=headers,
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response: posts={len(data.get('posts', []))}, hasMore={data.get('hasMore')}")
            print(f"  ✅ PASS - Feed endpoint working")
        else:
            print(f"  ❌ FAIL - Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
    except Exception as e:
        print(f"  ❌ FAIL - Exception: {e}")
    
    print()
    
    # Test 3: GET /api/uploads
    print("[TEST 3] GET /api/uploads")
    try:
        headers = {}
        if session_token:
            headers['Authorization'] = f'Bearer {session_token}'
        if cookie_header:
            headers['Cookie'] = cookie_header
            
        response = requests.get(
            f"{BASE_URL}/uploads",
            headers=headers,
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response: posts={len(data.get('posts', []))}, hasMore={data.get('hasMore')}")
            print(f"  ✅ PASS - Uploads endpoint working")
        else:
            print(f"  ❌ FAIL - Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
    except Exception as e:
        print(f"  ❌ FAIL - Exception: {e}")
    
    print()
    
    # Test 4: GET /api/challenges (with session)
    print("[TEST 4] GET /api/challenges (with session)")
    try:
        headers = {}
        if session_token:
            headers['Authorization'] = f'Bearer {session_token}'
        if cookie_header:
            headers['Cookie'] = cookie_header
            
        response = requests.get(
            f"{BASE_URL}/challenges",
            headers=headers,
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response: challenges={len(data.get('challenges', []))}")
            print(f"  ✅ PASS - Challenges endpoint working")
        else:
            print(f"  ❌ FAIL - Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
    except Exception as e:
        print(f"  ❌ FAIL - Exception: {e}")
    
    print()
    
    # Test 5: GET /api/notifications/unread (with session)
    print("[TEST 5] GET /api/notifications/unread (with session)")
    try:
        headers = {}
        if session_token:
            headers['Authorization'] = f'Bearer {session_token}'
        if cookie_header:
            headers['Cookie'] = cookie_header
            
        response = requests.get(
            f"{BASE_URL}/notifications/unread",
            headers=headers,
            timeout=10
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response: count={data.get('count')}")
            print(f"  ✅ PASS - Notifications endpoint working")
        else:
            print(f"  ❌ FAIL - Expected 200, got {response.status_code}")
            print(f"  Response: {response.text[:200]}")
    except Exception as e:
        print(f"  ❌ FAIL - Exception: {e}")
    
    print()
    print("=" * 80)
    print("SMOKE TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    test_smoke()
