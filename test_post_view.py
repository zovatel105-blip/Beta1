#!/usr/bin/env python3
"""
Backend test for POST /api/post-view endpoint
Tests the views counter increment feature in the Twyk app
"""

import requests
import os
import sys
import time

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://battle-preview-4.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test credentials
TEST_USERS = {
    'lucia': 'Test12345',
    'marcos': 'Test12345',
    'twykadmin': 'Admin12345'
}

def print_test(name):
    """Print test name"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_pass(msg):
    """Print pass message"""
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    """Print fail message"""
    print(f"❌ FAIL: {msg}")

def login(username, password):
    """Login and return session cookie"""
    try:
        print(f"\n🔐 Logging in as {username}...")
        response = requests.post(
            f"{API_URL}/auth/login",
            json={'username': username, 'password': password},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                session_cookie = response.cookies.get('session_token')
                if session_cookie:
                    print_pass(f"Logged in as {username}, got session cookie")
                    return {'session_token': session_cookie}
                else:
                    print_fail(f"Login succeeded but no session cookie received")
                    return None
            else:
                print_fail(f"Login response ok=False: {data}")
                return None
        else:
            print_fail(f"Login failed with status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print_fail(f"Login exception: {e}")
        return None

def get_real_post_id(cookies):
    """Get a real post id from a user's profile"""
    try:
        print(f"\n📡 Fetching real post id from user profiles...")
        
        # Try lucia first
        response = requests.get(f"{API_URL}/users/lucia", cookies=cookies, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('posts') and len(data['posts']) > 0:
                post_id = data['posts'][0]['id']
                author = data['posts'][0].get('author', {}).get('username', 'lucia')
                print_pass(f"Found post id: {post_id} (author: {author})")
                return post_id, author
        
        # Try marcos
        response = requests.get(f"{API_URL}/users/marcos", cookies=cookies, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('posts') and len(data['posts']) > 0:
                post_id = data['posts'][0]['id']
                author = data['posts'][0].get('author', {}).get('username', 'marcos')
                print_pass(f"Found post id: {post_id} (author: {author})")
                return post_id, author
        
        # Try twykadmin
        response = requests.get(f"{API_URL}/users/twykadmin", cookies=cookies, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('posts') and len(data['posts']) > 0:
                post_id = data['posts'][0]['id']
                author = data['posts'][0].get('author', {}).get('username', 'twykadmin')
                print_pass(f"Found post id: {post_id} (author: {author})")
                return post_id, author
        
        # Try uploads endpoint
        response = requests.get(f"{API_URL}/uploads", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('posts') and len(data['posts']) > 0:
                post_id = data['posts'][0]['id']
                author = data['posts'][0].get('author', {}).get('username', 'unknown')
                print_pass(f"Found post id from uploads: {post_id} (author: {author})")
                return post_id, author
        
        print_fail("No posts found in any user profile or uploads")
        return None, None
    except Exception as e:
        print_fail(f"Exception getting post id: {e}")
        return None, None

def get_post_views(post_id, author_username, cookies):
    """Get current views count for a post"""
    try:
        response = requests.get(f"{API_URL}/users/{author_username}", cookies=cookies, timeout=10)
        if response.status_code == 200:
            data = response.json()
            posts = data.get('posts', [])
            for post in posts:
                if post['id'] == post_id:
                    views = post.get('stats', {}).get('views', 0)
                    return views
        return None
    except Exception as e:
        print(f"⚠️  Exception getting views: {e}")
        return None

def test_increment_views(cookies, post_id, author_username):
    """Test 1-3: POST /api/post-view increments views counter"""
    print_test("Increment views counter (3 calls)")
    
    try:
        # Get initial views count
        initial_views = get_post_views(post_id, author_username, cookies)
        if initial_views is None:
            print_fail("Could not get initial views count")
            return False
        
        print(f"📊 Initial views: {initial_views}")
        
        # First call
        print("\n📤 Call 1: POST /api/post-view...")
        response = requests.post(
            f"{API_URL}/post-view",
            json={'id': post_id},
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code != 200:
            print_fail(f"Call 1: Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        if not data.get('ok'):
            print_fail(f"Call 1: Expected ok=true, got {data}")
            return False
        
        print_pass(f"Call 1: Got 200 with ok=true")
        
        # Check views incremented to initial + 1
        time.sleep(0.5)  # Small delay to ensure DB update
        views_after_1 = get_post_views(post_id, author_username, cookies)
        if views_after_1 is None:
            print_fail("Could not get views after call 1")
            return False
        
        if views_after_1 == initial_views + 1:
            print_pass(f"Views incremented correctly: {initial_views} -> {views_after_1}")
        else:
            print_fail(f"Views not incremented correctly: expected {initial_views + 1}, got {views_after_1}")
            return False
        
        # Second call
        print("\n📤 Call 2: POST /api/post-view...")
        response = requests.post(
            f"{API_URL}/post-view",
            json={'id': post_id},
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code != 200 or not response.json().get('ok'):
            print_fail(f"Call 2: Failed")
            return False
        
        print_pass(f"Call 2: Got 200 with ok=true")
        
        # Third call
        print("\n📤 Call 3: POST /api/post-view...")
        response = requests.post(
            f"{API_URL}/post-view",
            json={'id': post_id},
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code != 200 or not response.json().get('ok'):
            print_fail(f"Call 3: Failed")
            return False
        
        print_pass(f"Call 3: Got 200 with ok=true")
        
        # Check final views count (should be initial + 3)
        time.sleep(0.5)
        final_views = get_post_views(post_id, author_username, cookies)
        if final_views is None:
            print_fail("Could not get final views count")
            return False
        
        expected_final = initial_views + 3
        if final_views == expected_final:
            print_pass(f"Final views correct: {initial_views} -> {final_views} (incremented by 3)")
            return True
        else:
            print_fail(f"Final views incorrect: expected {expected_final}, got {final_views}")
            return False
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_missing_id():
    """Test 4: POST /api/post-view with missing id (expect 400)"""
    print_test("Missing id parameter (expect 400)")
    
    try:
        # Test with no body
        print("\n📤 Testing with no body...")
        response = requests.post(
            f"{API_URL}/post-view",
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 400:
            data = response.json()
            if data.get('error') == 'missing_id':
                print_pass(f"No body: Got 400 with error='missing_id' as expected")
            else:
                print_fail(f"No body: Got 400 but wrong error: {data}")
                return False
        else:
            print_fail(f"No body: Expected 400, got {response.status_code}: {response.text}")
            return False
        
        # Test with empty body
        print("\n📤 Testing with empty body...")
        response = requests.post(
            f"{API_URL}/post-view",
            json={},
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 400:
            data = response.json()
            if data.get('error') == 'missing_id':
                print_pass(f"Empty body: Got 400 with error='missing_id' as expected")
                return True
            else:
                print_fail(f"Empty body: Got 400 but wrong error: {data}")
                return False
        else:
            print_fail(f"Empty body: Expected 400, got {response.status_code}: {response.text}")
            return False
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_fake_id():
    """Test 5: POST /api/post-view with fake/non-existent id (expect 200, no 500)"""
    print_test("Fake/non-existent id (expect 200 ok=true, no 500)")
    
    try:
        fake_id = "does-not-exist-12345"
        print(f"\n📤 Testing with fake id: {fake_id}...")
        
        response = requests.post(
            f"{API_URL}/post-view",
            json={'id': fake_id},
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                print_pass(f"Got 200 with ok=true (no-op for non-existent id, as expected)")
                return True
            else:
                print_fail(f"Got 200 but ok=false: {data}")
                return False
        else:
            print_fail(f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_public_endpoint():
    """Test 6: POST /api/post-view works without authentication (public endpoint)"""
    print_test("Public endpoint (no auth required)")
    
    try:
        # First get a real post id (need to login for this)
        cookies = login('lucia', TEST_USERS['lucia'])
        if not cookies:
            print_fail("Could not login to get post id")
            return False
        
        post_id, author = get_real_post_id(cookies)
        if not post_id:
            print_fail("Could not get real post id")
            return False
        
        # Now call POST /api/post-view WITHOUT any auth
        print(f"\n📤 Calling POST /api/post-view WITHOUT auth headers/cookies...")
        response = requests.post(
            f"{API_URL}/post-view",
            json={'id': post_id},
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                print_pass(f"Got 200 with ok=true (public endpoint works without auth)")
                return True
            else:
                print_fail(f"Got 200 but ok=false: {data}")
                return False
        else:
            print_fail(f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_regression():
    """Test 7: Regression check - verify other endpoints still work"""
    print_test("Regression check on other endpoints")
    
    results = []
    
    # Test GET /api/feed
    try:
        print("\n📡 Testing GET /api/feed...")
        response = requests.get(f"{API_URL}/feed?cursor=0&limit=8", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if 'posts' in data:
                print_pass(f"GET /api/feed returned 200 with {len(data['posts'])} posts")
                results.append(True)
            else:
                print_fail(f"GET /api/feed returned 200 but no 'posts' field: {data}")
                results.append(False)
        else:
            print_fail(f"GET /api/feed returned {response.status_code}: {response.text}")
            results.append(False)
    except Exception as e:
        print_fail(f"GET /api/feed exception: {e}")
        results.append(False)
    
    # Test GET /api/users/lucia
    try:
        print("\n📡 Testing GET /api/users/lucia...")
        response = requests.get(f"{API_URL}/users/lucia", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if 'user' in data:
                print_pass(f"GET /api/users/lucia returned 200 with user data")
                results.append(True)
            else:
                print_fail(f"GET /api/users/lucia returned 200 but no 'user' field: {data}")
                results.append(False)
        else:
            print_fail(f"GET /api/users/lucia returned {response.status_code}: {response.text}")
            results.append(False)
    except Exception as e:
        print_fail(f"GET /api/users/lucia exception: {e}")
        results.append(False)
    
    # Test POST /api/auth/login
    try:
        print("\n📡 Testing POST /api/auth/login...")
        response = requests.post(
            f"{API_URL}/auth/login",
            json={'username': 'lucia', 'password': 'Test12345'},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                print_pass(f"POST /api/auth/login returned 200 ok=True")
                results.append(True)
            else:
                print_fail(f"POST /api/auth/login returned 200 but ok=False: {data}")
                results.append(False)
        else:
            print_fail(f"POST /api/auth/login returned {response.status_code}: {response.text}")
            results.append(False)
    except Exception as e:
        print_fail(f"POST /api/auth/login exception: {e}")
        results.append(False)
    
    return all(results)

def main():
    """Main test runner"""
    print("\n" + "="*80)
    print("BACKEND TEST: POST /api/post-view")
    print("Testing views counter increment endpoint in Twyk app")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"API URL: {API_URL}")
    
    results = {}
    
    # Login to get session cookie (needed to fetch real post ids)
    cookies = login('lucia', TEST_USERS['lucia'])
    
    if not cookies:
        print_fail("Failed to login, cannot continue")
        sys.exit(1)
    
    # Get a real post id
    post_id, author = get_real_post_id(cookies)
    
    if not post_id:
        print_fail("Failed to get real post id, cannot continue with main tests")
        # Still run edge case tests
        results['missing_id'] = test_missing_id()
        results['fake_id'] = test_fake_id()
        results['regression'] = test_regression()
    else:
        # Test 1-3: Increment views (3 calls)
        results['increment_views'] = test_increment_views(cookies, post_id, author)
        
        # Test 4: Missing id
        results['missing_id'] = test_missing_id()
        
        # Test 5: Fake id
        results['fake_id'] = test_fake_id()
        
        # Test 6: Public endpoint (no auth)
        results['public_endpoint'] = test_public_endpoint()
        
        # Test 7: Regression
        results['regression'] = test_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    failed = total - passed
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "-"*80)
    print(f"Total: {total} tests | Passed: {passed} | Failed: {failed}")
    print("-"*80)
    
    if failed > 0:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == '__main__':
    main()
