#!/usr/bin/env python3
"""
Backend Authentication Gating Tests for TWYK App
Tests that publishing endpoints require authentication and reject guests with 401
"""

import requests
import json
import sys
import os

# Read base URL from .env file
def get_base_url():
    env_path = '/app/.env'
    base_url = None
    try:
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('NEXT_PUBLIC_BASE_URL='):
                    base_url = line.split('=', 1)[1].strip()
                    break
    except Exception as e:
        print(f"Warning: Could not read .env file: {e}")
    
    if not base_url:
        base_url = "http://localhost:3000"
    
    return base_url + "/api"

BASE_URL = get_base_url()
print(f"Using BASE_URL: {BASE_URL}")

# Test credentials from /app/memory/test_credentials.md
TEST_USERNAME = "testreg1"
TEST_PASSWORD = "secret123"

def create_dummy_mp4():
    """Create a minimal valid MP4 file for testing"""
    # Minimal MP4 with ftyp atom
    return b'\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6f\x6d\x00\x00\x02\x00' + b'\x00' * 100

def print_section(title):
    """Print a formatted section header"""
    print("\n" + "="*80)
    print(title)
    print("="*80)

# ============================================================================
# SCENARIO 1: GUEST (no auth) must be REJECTED with 401
# ============================================================================

def test_guest_versus():
    """Test: POST /api/versus without auth -> 401"""
    print_section("TEST 1a: POST /api/versus (GUEST - no auth) -> expect 401")
    
    try:
        fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
        fileB = ('videoB.mp4', create_dummy_mp4(), 'video/mp4')
        
        files = {'fileA': fileA, 'fileB': fileB}
        data = {'description': 'Test versus'}
        
        response = requests.post(f"{BASE_URL}/versus", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 401:
            print(f"❌ FAILED: Expected 401, got {response.status_code}")
            return False
        
        result = response.json()
        if result.get('error') != 'unauthorized':
            print(f"⚠️  Warning: Expected error 'unauthorized', got {result.get('error')}")
        
        print(f"✅ PASSED: Guest correctly rejected with 401")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_guest_duet():
    """Test: POST /api/duet without auth -> 401"""
    print_section("TEST 1b: POST /api/duet (GUEST - no auth) -> expect 401")
    
    try:
        fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
        fileB = ('videoB.mp4', create_dummy_mp4(), 'video/mp4')
        
        files = {'fileA': fileA, 'fileB': fileB}
        data = {'layout': 'horizontal', 'description': 'Test duet'}
        
        response = requests.post(f"{BASE_URL}/duet", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 401:
            print(f"❌ FAILED: Expected 401, got {response.status_code}")
            return False
        
        result = response.json()
        if result.get('error') != 'unauthorized':
            print(f"⚠️  Warning: Expected error 'unauthorized', got {result.get('error')}")
        
        print(f"✅ PASSED: Guest correctly rejected with 401")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_guest_challenges():
    """Test: POST /api/challenges without auth -> 401"""
    print_section("TEST 1c: POST /api/challenges (GUEST - no auth) -> expect 401")
    
    try:
        file = ('video.mp4', create_dummy_mp4(), 'video/mp4')
        target_author = {
            "username": "urbanlife",
            "name": "Marco",
            "avatarUrl": "x"
        }
        
        files = {'file': file}
        data = {
            'targetAuthor': json.dumps(target_author),
            'message': 'Test challenge'
        }
        
        response = requests.post(f"{BASE_URL}/challenges", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 401:
            print(f"❌ FAILED: Expected 401, got {response.status_code}")
            return False
        
        result = response.json()
        if result.get('error') != 'unauthorized':
            print(f"⚠️  Warning: Expected error 'unauthorized', got {result.get('error')}")
        
        print(f"✅ PASSED: Guest correctly rejected with 401")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

# ============================================================================
# SCENARIO 2: LOGIN
# ============================================================================

def test_login():
    """Test: POST /api/auth/login -> 200, capture session token"""
    print_section("TEST 2: POST /api/auth/login -> expect 200 with token")
    
    try:
        payload = {
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD
        }
        
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, None, None
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if not result.get('ok'):
            print(f"❌ FAILED: Response should have ok:true")
            return False, None, None
        
        # Extract token from response
        token = result.get('token')
        if not token:
            print(f"❌ FAILED: Response missing 'token' field")
            return False, None, None
        
        # Extract session cookie
        session_cookie = response.cookies.get('session_token')
        
        # Verify user data
        user = result.get('user')
        if not user or user.get('username') != TEST_USERNAME:
            print(f"❌ FAILED: User data incorrect")
            return False, None, None
        
        print(f"✅ PASSED: Login successful")
        print(f"   Token: {token[:20]}...")
        print(f"   Cookie: {session_cookie[:20] if session_cookie else 'None'}...")
        print(f"   Username: {user.get('username')}")
        
        return True, token, session_cookie
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False, None, None

# ============================================================================
# SCENARIO 3: AUTHENTICATED requests must SUCCEED with real author
# ============================================================================

def test_authenticated_versus_with_bearer(token):
    """Test: POST /api/versus with Bearer token -> 200, author.username === testreg1"""
    print_section("TEST 3a: POST /api/versus (AUTHENTICATED with Bearer token) -> expect 200")
    
    try:
        fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
        fileB = ('videoB.mp4', create_dummy_mp4(), 'video/mp4')
        
        files = {'fileA': fileA, 'fileB': fileB}
        data = {'description': 'Authenticated versus test'}
        headers = {'Authorization': f'Bearer {token}'}
        
        response = requests.post(f"{BASE_URL}/versus", files=files, data=data, headers=headers)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        post = result.get('post')
        if not post:
            print(f"❌ FAILED: Response missing 'post' field")
            return False
        
        # Verify author is the authenticated user (NOT 'usuario_anonimo')
        author_username = post.get('author', {}).get('username')
        sideA_author = post.get('sideA', {}).get('author', {}).get('username')
        sideB_author = post.get('sideB', {}).get('author', {}).get('username')
        
        print(f"   post.author.username: {author_username}")
        print(f"   post.sideA.author.username: {sideA_author}")
        print(f"   post.sideB.author.username: {sideB_author}")
        
        if author_username != TEST_USERNAME:
            print(f"❌ FAILED: post.author.username should be '{TEST_USERNAME}', got '{author_username}'")
            return False
        
        if sideA_author != TEST_USERNAME:
            print(f"❌ FAILED: post.sideA.author.username should be '{TEST_USERNAME}', got '{sideA_author}'")
            return False
        
        if sideB_author != TEST_USERNAME:
            print(f"❌ FAILED: post.sideB.author.username should be '{TEST_USERNAME}', got '{sideB_author}'")
            return False
        
        print(f"✅ PASSED: Versus created with correct authenticated author")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_authenticated_duet_with_cookie(session_cookie):
    """Test: POST /api/duet with session cookie -> 200, author.username === testreg1"""
    print_section("TEST 3b: POST /api/duet (AUTHENTICATED with cookie) -> expect 200")
    
    try:
        fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
        fileB = ('videoB.mp4', create_dummy_mp4(), 'video/mp4')
        
        files = {'fileA': fileA, 'fileB': fileB}
        data = {'layout': 'vertical', 'description': 'Authenticated duet test'}
        cookies = {'session_token': session_cookie}
        
        response = requests.post(f"{BASE_URL}/duet", files=files, data=data, cookies=cookies)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        post = result.get('post')
        if not post:
            print(f"❌ FAILED: Response missing 'post' field")
            return False
        
        # Verify author is the authenticated user
        author_username = post.get('author', {}).get('username')
        sideA_author = post.get('sideA', {}).get('author', {}).get('username')
        sideB_author = post.get('sideB', {}).get('author', {}).get('username')
        
        print(f"   post.author.username: {author_username}")
        print(f"   post.sideA.author.username: {sideA_author}")
        print(f"   post.sideB.author.username: {sideB_author}")
        
        if author_username != TEST_USERNAME:
            print(f"❌ FAILED: post.author.username should be '{TEST_USERNAME}', got '{author_username}'")
            return False
        
        if sideA_author != TEST_USERNAME:
            print(f"❌ FAILED: post.sideA.author.username should be '{TEST_USERNAME}', got '{sideA_author}'")
            return False
        
        if sideB_author != TEST_USERNAME:
            print(f"❌ FAILED: post.sideB.author.username should be '{TEST_USERNAME}', got '{sideB_author}'")
            return False
        
        print(f"✅ PASSED: Duet created with correct authenticated author")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_authenticated_challenges_with_bearer(token):
    """Test: POST /api/challenges with Bearer token -> 200, challenge.from.username === testreg1"""
    print_section("TEST 3c: POST /api/challenges (AUTHENTICATED with Bearer token) -> expect 200")
    
    try:
        file = ('video.mp4', create_dummy_mp4(), 'video/mp4')
        target_author = {
            "username": "urbanlife",
            "name": "Marco",
            "avatarUrl": "x"
        }
        
        files = {'file': file}
        data = {
            'targetAuthor': json.dumps(target_author),
            'message': 'Authenticated challenge test'
        }
        headers = {'Authorization': f'Bearer {token}'}
        
        response = requests.post(f"{BASE_URL}/challenges", files=files, data=data, headers=headers)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        challenge = result.get('challenge')
        if not challenge:
            print(f"❌ FAILED: Response missing 'challenge' field")
            return False
        
        # Verify challenge.from is the authenticated user
        from_username = challenge.get('from', {}).get('username')
        
        print(f"   challenge.from.username: {from_username}")
        
        if from_username != TEST_USERNAME:
            print(f"❌ FAILED: challenge.from.username should be '{TEST_USERNAME}', got '{from_username}'")
            return False
        
        print(f"✅ PASSED: Challenge created with correct authenticated author")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

# ============================================================================
# SCENARIO 4: /api/auth/me endpoint
# ============================================================================

def test_auth_me_without_cookie():
    """Test: GET /api/auth/me without cookie -> 401"""
    print_section("TEST 4a: GET /api/auth/me (no auth) -> expect 401")
    
    try:
        response = requests.get(f"{BASE_URL}/auth/me")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 401:
            print(f"❌ FAILED: Expected 401, got {response.status_code}")
            return False
        
        result = response.json()
        if result.get('error') != 'unauthorized':
            print(f"⚠️  Warning: Expected error 'unauthorized', got {result.get('error')}")
        
        print(f"✅ PASSED: Correctly rejected with 401")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_auth_me_with_token(token):
    """Test: GET /api/auth/me with Bearer token -> 200, user.username === testreg1"""
    print_section("TEST 4b: GET /api/auth/me (with Bearer token) -> expect 200")
    
    try:
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        user = result.get('user')
        if not user:
            print(f"❌ FAILED: Response missing 'user' field")
            return False
        
        username = user.get('username')
        print(f"   user.username: {username}")
        
        if username != TEST_USERNAME:
            print(f"❌ FAILED: user.username should be '{TEST_USERNAME}', got '{username}'")
            return False
        
        print(f"✅ PASSED: Auth/me returned correct user")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

# ============================================================================
# SCENARIO 5: REGRESSION - endpoints that should still work
# ============================================================================

def test_regression_feed():
    """Test: GET /api/feed?cursor=0&limit=8 -> 200 with posts array"""
    print_section("TEST 5a: GET /api/feed (REGRESSION) -> expect 200")
    
    try:
        response = requests.get(f"{BASE_URL}/feed?cursor=0&limit=8")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        
        if 'posts' not in result:
            print(f"❌ FAILED: Response missing 'posts' field")
            return False
        
        posts = result['posts']
        if not isinstance(posts, list):
            print(f"❌ FAILED: 'posts' should be a list")
            return False
        
        print(f"✅ PASSED: Feed returned {len(posts)} posts")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_regression_users():
    """Test: GET /api/users -> 200 with users array"""
    print_section("TEST 5b: GET /api/users (REGRESSION) -> expect 200")
    
    try:
        response = requests.get(f"{BASE_URL}/users")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        
        if 'users' not in result:
            print(f"❌ FAILED: Response missing 'users' field")
            return False
        
        users = result['users']
        if not isinstance(users, list):
            print(f"❌ FAILED: 'users' should be a list")
            return False
        
        print(f"✅ PASSED: Users endpoint returned {len(users)} users")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    """Run all authentication gating tests"""
    print("\n" + "="*80)
    print("BACKEND AUTHENTICATION GATING TESTS - TWYK APP")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Test User: {TEST_USERNAME}")
    
    results = {}
    
    # SCENARIO 1: Guest requests must be rejected with 401
    print("\n" + "="*80)
    print("SCENARIO 1: GUEST (no auth) must be REJECTED with 401")
    print("="*80)
    results['1a. POST /api/versus (guest)'] = test_guest_versus()
    results['1b. POST /api/duet (guest)'] = test_guest_duet()
    results['1c. POST /api/challenges (guest)'] = test_guest_challenges()
    
    # SCENARIO 2: Login
    print("\n" + "="*80)
    print("SCENARIO 2: LOGIN")
    print("="*80)
    login_success, token, session_cookie = test_login()
    results['2. POST /api/auth/login'] = login_success
    
    if not login_success:
        print("\n❌ CRITICAL: Login failed, cannot continue with authenticated tests")
        print_summary(results)
        return 1
    
    # SCENARIO 3: Authenticated requests must succeed with real author
    print("\n" + "="*80)
    print("SCENARIO 3: AUTHENTICATED requests must SUCCEED with real author")
    print("="*80)
    results['3a. POST /api/versus (authenticated)'] = test_authenticated_versus_with_bearer(token)
    results['3b. POST /api/duet (authenticated)'] = test_authenticated_duet_with_cookie(session_cookie)
    results['3c. POST /api/challenges (authenticated)'] = test_authenticated_challenges_with_bearer(token)
    
    # SCENARIO 4: /api/auth/me endpoint
    print("\n" + "="*80)
    print("SCENARIO 4: /api/auth/me endpoint")
    print("="*80)
    results['4a. GET /api/auth/me (no auth)'] = test_auth_me_without_cookie()
    results['4b. GET /api/auth/me (with token)'] = test_auth_me_with_token(token)
    
    # SCENARIO 5: Regression tests
    print("\n" + "="*80)
    print("SCENARIO 5: REGRESSION - endpoints that should still work")
    print("="*80)
    results['5a. GET /api/feed'] = test_regression_feed()
    results['5b. GET /api/users'] = test_regression_users()
    
    # Print summary
    print_summary(results)
    
    # Return exit code
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    return 0 if passed == total else 1

def print_summary(results):
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All authentication gating tests passed!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    sys.exit(main())
