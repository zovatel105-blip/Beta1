#!/usr/bin/env python3
"""
Backend API Testing Script for Persistent Follow Feature
Tests the NEW persistent follow feature with MongoDB
IMPORTANT: Database 'twyk' is EMPTY - must register fresh users
"""

import requests
import json
import sys

# Base URL for API testing
BASE_URL = "http://localhost:3000/api"

def test_register_users():
    """
    Scenario A: Register two users via POST /api/auth/register
    Returns: (follower1_token, target1_username) or (None, None) on failure
    """
    print("\n" + "="*80)
    print("SCENARIO A: Register two users (follower1 and target1)")
    print("="*80)
    
    users = [
        {
            "username": "follower1",
            "email": "follower1@test.com",
            "password": "secret123"
        },
        {
            "username": "target1",
            "email": "target1@test.com",
            "password": "secret123"
        }
    ]
    
    follower1_token = None
    
    for user in users:
        try:
            print(f"\n--- Registering {user['username']} ---")
            response = requests.post(
                f"{BASE_URL}/auth/register",
                json=user,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code != 200:
                print(f"❌ FAILED: Expected 200, got {response.status_code}")
                return None, None
            
            data = response.json()
            
            # Verify response structure
            if 'user' not in data:
                print(f"❌ FAILED: Response missing 'user' field")
                return None, None
            
            # Check for token (Bearer) or session cookie
            token = data.get('token')
            if token and user['username'] == 'follower1':
                follower1_token = token
                print(f"✅ Got Bearer token for follower1: {token[:20]}...")
            
            # Check for session cookie
            cookies = response.cookies
            if 'session_token' in cookies and user['username'] == 'follower1':
                follower1_token = cookies['session_token']
                print(f"✅ Got session cookie for follower1: {follower1_token[:20]}...")
            
            print(f"✅ PASSED: User {user['username']} registered successfully")
            print(f"   User ID: {data['user'].get('id')}")
            print(f"   Username: {data['user'].get('username')}")
            
        except Exception as e:
            print(f"❌ FAILED with exception: {e}")
            import traceback
            traceback.print_exc()
            return None, None
    
    if not follower1_token:
        print("❌ FAILED: Could not get token/cookie for follower1")
        return None, None
    
    print(f"\n✅ SCENARIO A PASSED: Both users registered, follower1 token obtained")
    return follower1_token, "target1"


def test_follow_without_session(target_username):
    """
    Scenario B: POST /api/users/target1/follow WITHOUT session -> expect 401
    """
    print("\n" + "="*80)
    print("SCENARIO B: POST /api/users/target1/follow WITHOUT session")
    print("="*80)
    
    try:
        response = requests.post(f"{BASE_URL}/users/{target_username}/follow")
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 401:
            print(f"❌ FAILED: Expected 401 unauthorized, got {response.status_code}")
            return False
        
        data = response.json()
        if data.get('error') != 'unauthorized':
            print(f"❌ FAILED: Expected error 'unauthorized', got {data.get('error')}")
            return False
        
        print(f"✅ SCENARIO B PASSED: Correctly returns 401 unauthorized")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_follow_with_session(follower_token, target_username, is_cookie=False):
    """
    Scenario C: POST /api/users/target1/follow WITH follower1 session
    Expected: 200 {ok:true, following:true, followers:1}
    """
    print("\n" + "="*80)
    print("SCENARIO C: POST /api/users/target1/follow WITH follower1 session")
    print("="*80)
    
    try:
        headers = {}
        cookies = {}
        
        if is_cookie:
            cookies = {"session_token": follower_token}
            print(f"Using session cookie: {follower_token[:20]}...")
        else:
            headers = {"Authorization": f"Bearer {follower_token}"}
            print(f"Using Bearer token: {follower_token[:20]}...")
        
        response = requests.post(
            f"{BASE_URL}/users/{target_username}/follow",
            headers=headers,
            cookies=cookies
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Verify response structure
        checks = [
            (data.get('ok') == True, f"ok should be true, got {data.get('ok')}"),
            (data.get('following') == True, f"following should be true, got {data.get('following')}"),
            (data.get('followers') == 1, f"followers should be 1, got {data.get('followers')}"),
        ]
        
        all_passed = True
        for check, msg in checks:
            if not check:
                print(f"❌ FAILED: {msg}")
                all_passed = False
        
        if not all_passed:
            return False
        
        print(f"✅ SCENARIO C PASSED: Follow successful - following:true, followers:1")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_follow_toggle(follower_token, target_username, is_cookie=False):
    """
    Scenario D: Toggle follow twice
    1st POST -> {following:false, followers:0}
    2nd POST -> {following:true, followers:1}
    """
    print("\n" + "="*80)
    print("SCENARIO D: Toggle follow (unfollow then follow again)")
    print("="*80)
    
    try:
        headers = {}
        cookies = {}
        
        if is_cookie:
            cookies = {"session_token": follower_token}
        else:
            headers = {"Authorization": f"Bearer {follower_token}"}
        
        # First toggle - should unfollow
        print("\n--- First toggle (unfollow) ---")
        response1 = requests.post(
            f"{BASE_URL}/users/{target_username}/follow",
            headers=headers,
            cookies=cookies
        )
        
        print(f"Status Code: {response1.status_code}")
        print(f"Response: {response1.text}")
        
        if response1.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response1.status_code}")
            return False
        
        data1 = response1.json()
        
        if data1.get('following') != False:
            print(f"❌ FAILED: After unfollow, following should be false, got {data1.get('following')}")
            return False
        
        if data1.get('followers') != 0:
            print(f"❌ FAILED: After unfollow, followers should be 0, got {data1.get('followers')}")
            return False
        
        print(f"✅ First toggle successful: following:false, followers:0")
        
        # Second toggle - should follow again
        print("\n--- Second toggle (follow again) ---")
        response2 = requests.post(
            f"{BASE_URL}/users/{target_username}/follow",
            headers=headers,
            cookies=cookies
        )
        
        print(f"Status Code: {response2.status_code}")
        print(f"Response: {response2.text}")
        
        if response2.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response2.status_code}")
            return False
        
        data2 = response2.json()
        
        if data2.get('following') != True:
            print(f"❌ FAILED: After re-follow, following should be true, got {data2.get('following')}")
            return False
        
        if data2.get('followers') != 1:
            print(f"❌ FAILED: After re-follow, followers should be 1, got {data2.get('followers')}")
            return False
        
        print(f"✅ Second toggle successful: following:true, followers:1")
        print(f"✅ SCENARIO D PASSED: Toggle works correctly (idempotent)")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_follow_self(follower_token, is_cookie=False):
    """
    Scenario E: POST /api/users/follower1/follow with follower1 session
    Expected: 400 cannot_follow_yourself
    """
    print("\n" + "="*80)
    print("SCENARIO E: POST /api/users/follower1/follow (self-follow)")
    print("="*80)
    
    try:
        headers = {}
        cookies = {}
        
        if is_cookie:
            cookies = {"session_token": follower_token}
        else:
            headers = {"Authorization": f"Bearer {follower_token}"}
        
        response = requests.post(
            f"{BASE_URL}/users/follower1/follow",
            headers=headers,
            cookies=cookies
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        data = response.json()
        
        if data.get('error') != 'cannot_follow_yourself':
            print(f"❌ FAILED: Expected error 'cannot_follow_yourself', got {data.get('error')}")
            return False
        
        print(f"✅ SCENARIO E PASSED: Correctly prevents self-follow with 400 error")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_get_user_without_session(target_username):
    """
    Scenario F: GET /api/users/target1 WITHOUT session
    Expected: user.isFollowing=false, user.followers=1 (reflects persistent follow)
    """
    print("\n" + "="*80)
    print("SCENARIO F: GET /api/users/target1 WITHOUT session")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/users/{target_username}")
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if 'user' not in data:
            print(f"❌ FAILED: Response missing 'user' field")
            return False
        
        user = data['user']
        
        # Verify isFollowing is false (no session)
        if user.get('isFollowing') != False:
            print(f"❌ FAILED: isFollowing should be false (no session), got {user.get('isFollowing')}")
            return False
        
        # Verify followers count is 1 (persistent)
        if user.get('followers') != 1:
            print(f"❌ FAILED: followers should be 1 (persistent), got {user.get('followers')}")
            return False
        
        print(f"✅ SCENARIO F PASSED: isFollowing=false, followers=1 (persistent)")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_get_user_with_session(follower_token, target_username, is_cookie=False):
    """
    Scenario G: GET /api/users/target1 WITH follower1 session
    Expected: user.isFollowing=true
    """
    print("\n" + "="*80)
    print("SCENARIO G: GET /api/users/target1 WITH follower1 session")
    print("="*80)
    
    try:
        headers = {}
        cookies = {}
        
        if is_cookie:
            cookies = {"session_token": follower_token}
        else:
            headers = {"Authorization": f"Bearer {follower_token}"}
        
        response = requests.get(
            f"{BASE_URL}/users/{target_username}",
            headers=headers,
            cookies=cookies
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if 'user' not in data:
            print(f"❌ FAILED: Response missing 'user' field")
            return False
        
        user = data['user']
        
        # Verify isFollowing is true (with session)
        if user.get('isFollowing') != True:
            print(f"❌ FAILED: isFollowing should be true (with session), got {user.get('isFollowing')}")
            return False
        
        print(f"✅ SCENARIO G PASSED: isFollowing=true (with follower1 session)")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_follow_demo_author(follower_token, is_cookie=False):
    """
    Scenario H: Follow a demo author (non-registered user)
    Get a demo username from GET /api/users and follow them
    Expected: 200 {ok:true, following:true}
    """
    print("\n" + "="*80)
    print("SCENARIO H: Follow a demo author (non-registered user)")
    print("="*80)
    
    try:
        # First, get list of demo users
        print("\n--- Getting demo users from GET /api/users ---")
        users_response = requests.get(f"{BASE_URL}/users")
        
        if users_response.status_code != 200:
            print(f"❌ FAILED: Could not get users list")
            return False
        
        users_data = users_response.json()
        demo_users = users_data.get('users', [])
        
        if not demo_users:
            print(f"❌ FAILED: No demo users found")
            return False
        
        # Pick a demo author (not follower1 or target1)
        demo_author = None
        for user in demo_users:
            if user['username'] not in ['follower1', 'target1']:
                demo_author = user['username']
                break
        
        if not demo_author:
            print(f"❌ FAILED: Could not find a suitable demo author")
            return False
        
        print(f"Selected demo author: {demo_author}")
        
        # Now follow the demo author
        print(f"\n--- Following demo author {demo_author} ---")
        
        headers = {}
        cookies = {}
        
        if is_cookie:
            cookies = {"session_token": follower_token}
        else:
            headers = {"Authorization": f"Bearer {follower_token}"}
        
        response = requests.post(
            f"{BASE_URL}/users/{demo_author}/follow",
            headers=headers,
            cookies=cookies
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Verify response
        if data.get('ok') != True:
            print(f"❌ FAILED: ok should be true, got {data.get('ok')}")
            return False
        
        if data.get('following') != True:
            print(f"❌ FAILED: following should be true, got {data.get('following')}")
            return False
        
        print(f"✅ SCENARIO H PASSED: Successfully followed demo author {demo_author}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_feed():
    """
    Regression: GET /api/feed?cursor=0&limit=8 -> 200 with posts
    """
    print("\n" + "="*80)
    print("REGRESSION: GET /api/feed")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/feed?cursor=0&limit=8")
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        
        if 'posts' not in data:
            print(f"❌ FAILED: Response missing 'posts' field")
            return False
        
        posts = data['posts']
        print(f"✅ REGRESSION PASSED: GET /api/feed returned {len(posts)} posts")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_users():
    """
    Regression: GET /api/users -> 200 with users list
    """
    print("\n" + "="*80)
    print("REGRESSION: GET /api/users")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/users")
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        
        if 'users' not in data:
            print(f"❌ FAILED: Response missing 'users' field")
            return False
        
        users = data['users']
        print(f"✅ REGRESSION PASSED: GET /api/users returned {len(users)} users")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all follow feature tests"""
    print("\n" + "="*80)
    print("BACKEND API TESTING - PERSISTENT FOLLOW FEATURE")
    print("Database: twyk (EMPTY - registering fresh users)")
    print("="*80)
    
    results = {}
    
    # Scenario A: Register users
    follower_token, target_username = test_register_users()
    results['Scenario A: Register users'] = (follower_token is not None)
    
    if not follower_token:
        print("\n❌ CRITICAL: Could not register users. Aborting remaining tests.")
        print_summary(results)
        return 1
    
    # Determine if token is a cookie or Bearer token
    is_cookie = len(follower_token) > 50  # Session tokens are typically longer
    
    # Scenario B: Follow without session
    results['Scenario B: Follow without session (401)'] = test_follow_without_session(target_username)
    
    # Scenario C: Follow with session
    results['Scenario C: Follow with session'] = test_follow_with_session(follower_token, target_username, is_cookie)
    
    # Scenario D: Toggle follow
    results['Scenario D: Toggle follow (idempotent)'] = test_follow_toggle(follower_token, target_username, is_cookie)
    
    # Scenario E: Self-follow
    results['Scenario E: Self-follow (400)'] = test_follow_self(follower_token, is_cookie)
    
    # Scenario F: Get user without session
    results['Scenario F: GET user without session'] = test_get_user_without_session(target_username)
    
    # Scenario G: Get user with session
    results['Scenario G: GET user with session'] = test_get_user_with_session(follower_token, target_username, is_cookie)
    
    # Scenario H: Follow demo author
    results['Scenario H: Follow demo author'] = test_follow_demo_author(follower_token, is_cookie)
    
    # Regression tests
    results['Regression: GET /api/feed'] = test_regression_feed()
    results['Regression: GET /api/users'] = test_regression_users()
    
    # Print summary
    print_summary(results)
    
    # Return exit code
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    if passed == total:
        return 0
    else:
        return 1


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
        print("\n🎉 All tests passed!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")


if __name__ == "__main__":
    sys.exit(main())
