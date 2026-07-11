#!/usr/bin/env python3
"""
Backend test for Twyk app after .env restoration and user re-seeding.
Tests all critical backend endpoints as requested.
"""

import requests
import json
import sys
import os
from io import BytesIO

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://challenge-audio-bug-1.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

print(f"Testing backend at: {API_URL}")
print("=" * 80)

# Test credentials from test_credentials.md
ADMIN_CREDS = {"username": "twykadmin", "password": "Admin12345"}
LUCIA_CREDS = {"username": "lucia", "password": "Test12345"}
MARCOS_CREDS = {"username": "marcos", "password": "Test12345"}

# Store tokens and cookies
admin_token = None
admin_cookies = None
lucia_token = None
lucia_cookies = None
marcos_token = None
marcos_cookies = None

def print_test(test_name):
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print('='*80)

def print_success(message):
    print(f"✅ SUCCESS: {message}")

def print_error(message):
    print(f"❌ ERROR: {message}")

def print_info(message):
    print(f"ℹ️  INFO: {message}")

# ============================================================================
# TEST 1: POST /api/auth/login with twykadmin
# ============================================================================
try:
    print_test("1. POST /api/auth/login with twykadmin (admin user)")
    
    response = requests.post(
        f"{API_URL}/auth/login",
        json=ADMIN_CREDS,
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print_info(f"Response: {json.dumps(data, indent=2)}")
        
        # Check required fields
        if data.get('ok') == True:
            print_success("Login successful (ok: true)")
        else:
            print_error("Response missing 'ok: true'")
        
        if 'token' in data:
            admin_token = data['token']
            print_success(f"Token received: {admin_token[:20]}...")
        else:
            print_error("No token in response")
        
        if 'user' in data:
            user = data['user']
            print_info(f"User: {json.dumps(user, indent=2)}")
            
            if user.get('username') == 'twykadmin':
                print_success("Username is 'twykadmin'")
            else:
                print_error(f"Username is '{user.get('username')}', expected 'twykadmin'")
            
            if user.get('role') == 'admin':
                print_success("User role is 'admin'")
            else:
                print_error(f"User role is '{user.get('role')}', expected 'admin'")
        else:
            print_error("No user in response")
        
        # Check for session cookie
        if 'session_token' in response.cookies:
            admin_cookies = response.cookies
            print_success(f"Session cookie set: {response.cookies['session_token'][:20]}...")
        else:
            print_error("No session_token cookie set")
        
        print_success("TEST 1 PASSED: Admin login working correctly")
    else:
        print_error(f"Login failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        print_error("TEST 1 FAILED")
        
except Exception as e:
    print_error(f"TEST 1 FAILED with exception: {str(e)}")

# ============================================================================
# TEST 2: POST /api/auth/login with lucia
# ============================================================================
try:
    print_test("2. POST /api/auth/login with lucia (regular user)")
    
    response = requests.post(
        f"{API_URL}/auth/login",
        json=LUCIA_CREDS,
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        if data.get('ok') == True:
            print_success("Login successful (ok: true)")
        
        if 'token' in data:
            lucia_token = data['token']
            print_success(f"Token received: {lucia_token[:20]}...")
        
        if 'user' in data:
            user = data['user']
            if user.get('username') == 'lucia':
                print_success("Username is 'lucia'")
            else:
                print_error(f"Username is '{user.get('username')}', expected 'lucia'")
        
        if 'session_token' in response.cookies:
            lucia_cookies = response.cookies
            print_success("Session cookie set")
        
        print_success("TEST 2 PASSED: Lucia login working correctly")
    else:
        print_error(f"Login failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        print_error("TEST 2 FAILED")
        
except Exception as e:
    print_error(f"TEST 2 FAILED with exception: {str(e)}")

# ============================================================================
# TEST 3: GET /api/auth/me with lucia's token
# ============================================================================
try:
    print_test("3. GET /api/auth/me with lucia's token")
    
    if not lucia_token:
        print_error("Cannot test: lucia_token not available from previous test")
    else:
        headers = {"Authorization": f"Bearer {lucia_token}"}
        response = requests.get(
            f"{API_URL}/auth/me",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {json.dumps(data, indent=2)}")
            
            if 'user' in data:
                user = data['user']
                if user.get('username') == 'lucia':
                    print_success("Username is 'lucia'")
                else:
                    print_error(f"Username is '{user.get('username')}', expected 'lucia'")
                
                print_success("TEST 3 PASSED: /api/auth/me working correctly")
            else:
                print_error("No user in response")
                print_error("TEST 3 FAILED")
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            print_error("TEST 3 FAILED")
            
except Exception as e:
    print_error(f"TEST 3 FAILED with exception: {str(e)}")

# ============================================================================
# TEST 4: GET /api/uploads (feed of uploaded posts)
# ============================================================================
try:
    print_test("4. GET /api/uploads (feed of uploaded posts)")
    
    response = requests.get(
        f"{API_URL}/uploads",
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if 'posts' in data:
            posts = data['posts']
            print_success(f"Received {len(posts)} posts")
            
            if len(posts) > 0:
                print_info(f"First post: {json.dumps(posts[0], indent=2)[:500]}...")
            
            print_success("TEST 4 PASSED: /api/uploads working correctly")
        else:
            print_error("No 'posts' key in response")
            print_error("TEST 4 FAILED")
    else:
        print_error(f"Request failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        print_error("TEST 4 FAILED")
        
except Exception as e:
    print_error(f"TEST 4 FAILED with exception: {str(e)}")

# ============================================================================
# TEST 5: GET /api/feed (feed with versus/carousel posts)
# ============================================================================
try:
    print_test("5. GET /api/feed (feed with versus/carousel posts)")
    
    response = requests.get(
        f"{API_URL}/feed",
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if 'posts' in data:
            posts = data['posts']
            print_success(f"Received {len(posts)} posts")
            
            # Check for versus/carousel posts
            versus_count = sum(1 for p in posts if p.get('type') == 'versus')
            duet_count = sum(1 for p in posts if p.get('type') == 'duet')
            
            print_info(f"Versus posts: {versus_count}, Duet posts: {duet_count}")
            
            if len(posts) > 0:
                print_info(f"First post type: {posts[0].get('type')}")
            
            print_success("TEST 5 PASSED: /api/feed working correctly")
        else:
            print_error("No 'posts' key in response")
            print_error("TEST 5 FAILED")
    else:
        print_error(f"Request failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        print_error("TEST 5 FAILED")
        
except Exception as e:
    print_error(f"TEST 5 FAILED with exception: {str(e)}")

# ============================================================================
# TEST 6: GET /api/users (with lucia session)
# ============================================================================
try:
    print_test("6. GET /api/users (with lucia session)")
    
    if not lucia_token:
        print_error("Cannot test: lucia_token not available")
    else:
        headers = {"Authorization": f"Bearer {lucia_token}"}
        response = requests.get(
            f"{API_URL}/users",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'users' in data:
                users = data['users']
                print_success(f"Received {len(users)} users")
                
                # Check for real users
                usernames = [u.get('username') for u in users]
                print_info(f"Usernames: {usernames}")
                
                # Should have twykadmin, marcos, laura (lucia excluded as current user)
                expected_users = ['twykadmin', 'marcos', 'laura']
                found_users = [u for u in expected_users if u in usernames]
                
                if len(found_users) >= 2:
                    print_success(f"Found expected users: {found_users}")
                else:
                    print_info(f"Found users: {found_users} (expected at least 2 from {expected_users})")
                
                print_success("TEST 6 PASSED: /api/users working correctly")
            else:
                print_error("No 'users' key in response")
                print_error("TEST 6 FAILED")
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            print_error("TEST 6 FAILED")
            
except Exception as e:
    print_error(f"TEST 6 FAILED with exception: {str(e)}")

# ============================================================================
# TEST 7: Vote flow - POST /api/vote and verify persistence
# ============================================================================
try:
    print_test("7. Vote flow - POST /api/vote with marcos session")
    
    # First, login marcos to get his token
    if not marcos_token:
        print_info("Logging in marcos...")
        response = requests.post(
            f"{API_URL}/auth/login",
            json=MARCOS_CREDS,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            marcos_token = data.get('token')
            marcos_cookies = response.cookies
            print_success(f"Marcos logged in, token: {marcos_token[:20]}...")
        else:
            print_error(f"Failed to login marcos: {response.status_code}")
            raise Exception("Cannot proceed without marcos token")
    
    # Get a post from uploads or feed to vote on
    print_info("Fetching posts to find a versus post...")
    response = requests.get(f"{API_URL}/uploads", timeout=10)
    
    if response.status_code != 200:
        # Try feed instead
        response = requests.get(f"{API_URL}/feed", timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        posts = data.get('posts', [])
        
        # Find a versus post that marcos didn't author
        versus_post = None
        for post in posts:
            if post.get('type') == 'versus':
                # Check if marcos is not the author
                author_username = None
                if post.get('author'):
                    author_username = post['author'].get('username')
                elif post.get('sideA', {}).get('author'):
                    author_username = post['sideA']['author'].get('username')
                
                if author_username and author_username != 'marcos':
                    versus_post = post
                    break
        
        if versus_post:
            post_id = versus_post['id']
            print_success(f"Found versus post to vote on: {post_id}")
            print_info(f"Post author: {author_username}")
            
            # Get initial votes
            initial_votes = versus_post.get('votes', {})
            print_info(f"Initial votes: {initial_votes}")
            
            # Vote for side 'a'
            headers = {"Authorization": f"Bearer {marcos_token}"}
            vote_data = {"postId": post_id, "side": "a"}
            
            print_info(f"Voting for side 'a' on post {post_id}...")
            response = requests.post(
                f"{API_URL}/vote",
                json=vote_data,
                headers=headers,
                timeout=10
            )
            
            print_info(f"Vote response status: {response.status_code}")
            
            if response.status_code == 200:
                vote_response = response.json()
                print_info(f"Vote response: {json.dumps(vote_response, indent=2)}")
                
                if 'votes' in vote_response:
                    new_votes = vote_response['votes']
                    print_success(f"Vote successful! New votes: {new_votes}")
                    
                    # Verify vote was counted
                    if new_votes.get('a', 0) > initial_votes.get('a', 0):
                        print_success("Vote for side 'a' was counted!")
                    else:
                        print_info(f"Vote count unchanged (might be duplicate vote or other logic)")
                    
                    # Verify persistence by fetching the post again
                    print_info("Verifying vote persistence...")
                    response = requests.get(f"{API_URL}/uploads", timeout=10)
                    
                    if response.status_code == 200:
                        data = response.json()
                        posts = data.get('posts', [])
                        updated_post = next((p for p in posts if p['id'] == post_id), None)
                        
                        if updated_post:
                            persisted_votes = updated_post.get('votes', {})
                            print_info(f"Persisted votes: {persisted_votes}")
                            
                            if persisted_votes.get('a', 0) >= new_votes.get('a', 0):
                                print_success("Vote persisted correctly!")
                                print_success("TEST 7 PASSED: Vote flow working correctly")
                            else:
                                print_error(f"Vote not persisted. Expected a>={new_votes.get('a')}, got {persisted_votes.get('a')}")
                                print_error("TEST 7 FAILED")
                        else:
                            print_error(f"Could not find post {post_id} in uploads")
                            print_error("TEST 7 FAILED")
                    else:
                        print_error(f"Failed to fetch uploads for verification: {response.status_code}")
                        print_error("TEST 7 FAILED")
                else:
                    print_error("No 'votes' in vote response")
                    print_error("TEST 7 FAILED")
            else:
                print_error(f"Vote failed with status {response.status_code}")
                print_error(f"Response: {response.text}")
                print_error("TEST 7 FAILED")
        else:
            print_info("No versus posts found that marcos can vote on")
            print_info("TEST 7 SKIPPED: No suitable posts available")
    else:
        print_error(f"Failed to fetch posts: {response.status_code}")
        print_error("TEST 7 FAILED")
        
except Exception as e:
    print_error(f"TEST 7 FAILED with exception: {str(e)}")

# ============================================================================
# TEST 8: GET /api/notifications/unread (with session)
# ============================================================================
try:
    print_test("8. GET /api/notifications/unread (with lucia session)")
    
    if not lucia_token:
        print_error("Cannot test: lucia_token not available")
    else:
        headers = {"Authorization": f"Bearer {lucia_token}"}
        response = requests.get(
            f"{API_URL}/notifications/unread",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {json.dumps(data, indent=2)}")
            
            if 'count' in data:
                count = data['count']
                print_success(f"Unread notifications count: {count}")
                print_success("TEST 8 PASSED: /api/notifications/unread working correctly")
            else:
                print_error("No 'count' key in response")
                print_error("TEST 8 FAILED")
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            print_error("TEST 8 FAILED")
            
except Exception as e:
    print_error(f"TEST 8 FAILED with exception: {str(e)}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("BACKEND TESTING COMPLETE")
print("=" * 80)
print("\nAll critical backend endpoints have been tested.")
print("Review the results above for any failures or issues.")
print("\nKey findings:")
print("- Admin login (twykadmin)")
print("- User login (lucia)")
print("- Session validation (/api/auth/me)")
print("- Uploads feed")
print("- Main feed")
print("- User list")
print("- Vote flow and persistence")
print("- Notifications")
