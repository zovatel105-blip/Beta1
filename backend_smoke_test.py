#!/usr/bin/env python3
"""
Backend Smoke Test - Verify API functionality after .env restoration
Tests basic authentication and public endpoints to confirm no 500 errors
"""

import requests
import json
import sys

# Use the public preview URL from .env
BASE_URL = "https://feed-sync-17.preview.emergentagent.com/api"

def test_admin_login():
    """Scenario 1: Admin login with twykadmin/Admin12345"""
    print("\n" + "="*80)
    print("SCENARIO 1: Admin Login (twykadmin/Admin12345)")
    print("="*80)
    
    try:
        payload = {
            "username": "twykadmin",
            "password": "Admin12345"
        }
        
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False, None, None
        
        data = response.json()
        
        # Check ok:true
        if not data.get('ok'):
            print(f"❌ FAILED: Expected ok:true, got {data.get('ok')}")
            return False, None, None
        
        # Check user.role='admin'
        user = data.get('user', {})
        if user.get('role') != 'admin':
            print(f"❌ FAILED: Expected role='admin', got {user.get('role')}")
            return False, None, None
        
        # Check token present
        token = data.get('token')
        if not token:
            print(f"❌ FAILED: No token in response")
            return False, None, None
        
        # Check session_token cookie
        cookies = response.cookies
        session_cookie = cookies.get('session_token')
        if not session_cookie:
            print(f"❌ FAILED: No session_token cookie set")
            return False, None, None
        
        print(f"✅ PASSED: Admin login successful")
        print(f"  - ok: {data.get('ok')}")
        print(f"  - user.username: {user.get('username')}")
        print(f"  - user.role: {user.get('role')}")
        print(f"  - token: {token[:20]}...")
        print(f"  - session_token cookie: present")
        
        return True, token, cookies
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False, None, None

def test_auth_me(token, cookies):
    """Scenario 2: GET /api/auth/me with token/cookie"""
    print("\n" + "="*80)
    print("SCENARIO 2: GET /api/auth/me with session")
    print("="*80)
    
    try:
        # Test with Bearer token
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        print(f"Status Code (Bearer): {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)[:300]}")
        
        user = data.get('user', {})
        if user.get('username') != 'twykadmin':
            print(f"❌ FAILED: Expected username='twykadmin', got {user.get('username')}")
            return False
        
        print(f"✅ PASSED: GET /api/auth/me with Bearer token")
        print(f"  - user.username: {user.get('username')}")
        
        # Also test with cookie
        response_cookie = requests.get(f"{BASE_URL}/auth/me", cookies=cookies)
        print(f"Status Code (Cookie): {response_cookie.status_code}")
        
        if response_cookie.status_code == 200:
            print(f"✅ Cookie authentication also works")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_regular_user_login():
    """Scenario 3: Regular user login (lucia/Test12345)"""
    print("\n" + "="*80)
    print("SCENARIO 3: Regular User Login (lucia/Test12345)")
    print("="*80)
    
    try:
        payload = {
            "username": "lucia",
            "password": "Test12345"
        }
        
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        
        if not data.get('ok'):
            print(f"❌ FAILED: Expected ok:true")
            return False
        
        user = data.get('user', {})
        if user.get('username') != 'lucia':
            print(f"❌ FAILED: Expected username='lucia', got {user.get('username')}")
            return False
        
        print(f"✅ PASSED: Regular user login successful")
        print(f"  - user.username: {user.get('username')}")
        print(f"  - user.role: {user.get('role')}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_feed_without_session():
    """Scenario 4: GET /api/feed without session (should not 500)"""
    print("\n" + "="*80)
    print("SCENARIO 4: GET /api/feed?cursor=0&limit=8 (without session)")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/feed?cursor=0&limit=8")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        
        # Check structure
        if 'posts' not in data:
            print(f"❌ FAILED: Response missing 'posts' field")
            return False
        
        posts = data.get('posts', [])
        print(f"✅ PASSED: Feed endpoint working")
        print(f"  - posts count: {len(posts)}")
        print(f"  - has nextCursor: {'nextCursor' in data}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_users_without_session():
    """Scenario 5: GET /api/users without session (should include all 4 seeded users)"""
    print("\n" + "="*80)
    print("SCENARIO 5: GET /api/users (without session)")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/users")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False
        
        data = response.json()
        
        if 'users' not in data:
            print(f"❌ FAILED: Response missing 'users' field")
            return False
        
        users = data.get('users', [])
        usernames = [u.get('username') for u in users]
        
        # Check for the 4 seeded users
        expected_users = ['twykadmin', 'lucia', 'marcos', 'laura']
        missing_users = [u for u in expected_users if u not in usernames]
        
        if missing_users:
            print(f"❌ FAILED: Missing expected users: {missing_users}")
            print(f"  - Found usernames: {usernames}")
            return False
        
        print(f"✅ PASSED: Users endpoint working")
        print(f"  - Total users: {len(users)}")
        print(f"  - Seeded users found: {expected_users}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_login_wrong_password():
    """Scenario 6: Login with wrong password (should be 401, not 500)"""
    print("\n" + "="*80)
    print("SCENARIO 6: Login with wrong password")
    print("="*80)
    
    try:
        payload = {
            "username": "twykadmin",
            "password": "WrongPassword123"
        }
        
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 401:
            print(f"❌ FAILED: Expected 401, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        error = data.get('error')
        
        print(f"✅ PASSED: Wrong password correctly returns 401")
        print(f"  - error: {error}")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all smoke tests"""
    print("\n" + "="*80)
    print("BACKEND SMOKE TEST - .env Restoration Verification")
    print("Testing against:", BASE_URL)
    print("="*80)
    
    results = {}
    
    # Scenario 1: Admin login
    admin_success, token, cookies = test_admin_login()
    results['Admin Login'] = admin_success
    
    # Scenario 2: GET /api/auth/me (only if login succeeded)
    if admin_success and token:
        results['GET /api/auth/me'] = test_auth_me(token, cookies)
    else:
        print("\n⚠️  Skipping /api/auth/me test - admin login failed")
        results['GET /api/auth/me'] = False
    
    # Scenario 3: Regular user login
    results['Regular User Login'] = test_regular_user_login()
    
    # Scenario 4: Feed without session
    results['GET /api/feed (guest)'] = test_feed_without_session()
    
    # Scenario 5: Users without session
    results['GET /api/users (guest)'] = test_users_without_session()
    
    # Scenario 6: Wrong password
    results['Login Wrong Password'] = test_login_wrong_password()
    
    # Summary
    print("\n" + "="*80)
    print("SMOKE TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} scenarios passed")
    
    if passed == total:
        print("\n🎉 All smoke tests passed! API is functional after .env restoration.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} scenario(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
