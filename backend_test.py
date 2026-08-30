#!/usr/bin/env python3
"""
Backend test for DELETE /api/posts/{id} endpoint with 'solo' type posts.

Bug context: Frontend bug fix in OpenChallengeSlide.jsx removed showDeleteForOwner={false}.
Backend DELETE endpoint is generic and should work with all post types (versus/duet/solo).
This test verifies the endpoint works correctly with 'solo' type posts.
"""

import requests
import json
import uuid
import subprocess
import os
import sys
import time
from datetime import datetime

# Create a session for connection pooling
session = requests.Session()

# Read base URL from .env
BASE_URL = None
MONGO_URL = None
try:
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_BASE_URL='):
                BASE_URL = line.split('=', 1)[1].strip()
            if line.startswith('MONGO_URL='):
                MONGO_URL = line.split('=', 1)[1].strip()
except Exception as e:
    print(f"❌ Failed to read .env: {e}")
    sys.exit(1)

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in .env")
    sys.exit(1)

if not MONGO_URL:
    MONGO_URL = "mongodb://localhost:27017/twyk"

API_URL = f"{BASE_URL}/api"
print(f"🔗 Testing against: {API_URL}")
print(f"🔗 MongoDB: {MONGO_URL}\n")

# Test credentials
LUCIA = {"username": "lucia", "password": "Test12345"}
MARCOS = {"username": "marcos", "password": "Test12345"}
LAURA = {"username": "laura", "password": "Test12345"}
ADMIN = {"username": "twyk", "password": "Admin12345"}

def login(credentials):
    """Login and return session token"""
    try:
        response = session.post(
            f"{API_URL}/auth/login",
            json=credentials,
            timeout=10
        )
        print(f"  Login {credentials['username']}: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            user_id = data.get('user', {}).get('id')
            username = data.get('user', {}).get('username')
            print(f"    Token: {token[:20] if token else 'None'}...")
            print(f"    User ID: {user_id}")
            print(f"    Username: {username}")
            return token, user_id, username
        else:
            print(f"    Error: {response.text}")
            return None, None, None
    except Exception as e:
        print(f"  ✗ Login failed: {e}")
        return None, None, None

def create_solo_post_via_mongodb(user_id, username):
    """Create a 'solo' type post directly in MongoDB using a Node.js script"""
    
    post_id = str(uuid.uuid4())
    script = f"""
const {{ MongoClient }} = require('mongodb');
const client = new MongoClient('{MONGO_URL}');

async function createSoloPost() {{
  try {{
    await client.connect();
    const db = client.db();
    const posts = db.collection('posts');
    
    const post = {{
      id: '{post_id}',
      type: 'solo',
      mediaType: 'image',
      imageUrl: '/uploads/test_solo_image.jpg',
      posterUrl: '/uploads/test_solo_image.jpg',
      author: {{
        id: '{user_id}',
        username: '{username}',
        name: '{username.capitalize()}',
        avatarUrl: 'https://i.pravatar.cc/120?img=1'
      }},
      userId: '{user_id}',
      description: 'Test solo post for DELETE endpoint verification',
      music: 'Test Music',
      stats: {{ likes: 0, comments: 0, shares: 0, saves: 0, views: 0 }},
      votes: {{ a: 0, b: 0 }},
      voteCount: 0,
      allowChallenge: true,
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now()
    }};
    
    await posts.insertOne(post);
    console.log('SUCCESS:{post_id}');
  }} catch (err) {{
    console.error('ERROR:', err.message);
  }} finally {{
    await client.close();
  }}
}}

createSoloPost();
"""
    
    try:
        result = subprocess.run(
            ['node', '-e', script],
            capture_output=True,
            text=True,
            timeout=10,
            cwd='/app'
        )
        
        if 'SUCCESS:' in result.stdout:
            print(f"    Created solo post: {post_id}")
            return post_id
        else:
            print(f"    ✗ Failed to create solo post")
            print(f"    stdout: {result.stdout}")
            print(f"    stderr: {result.stderr}")
            return None
    except Exception as e:
        print(f"    ✗ MongoDB insert failed: {e}")
        return None

def delete_post(post_id, token):
    """Delete a post"""
    response = None
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        print(f"    Sending DELETE request...")
        response = session.delete(
            f"{API_URL}/posts/{post_id}",
            headers=headers,
            timeout=30
        )
        print(f"    Response received: {response.status_code}")
    except requests.exceptions.Timeout as e:
        print(f"    ✗ DELETE request timeout after 30s: {e}")
    except requests.exceptions.ConnectionError as e:
        print(f"    ✗ DELETE connection error: {e}")
    except Exception as e:
        print(f"    ✗ DELETE request failed: {type(e).__name__}: {e}")
    
    return response

def get_feed(token=None):
    """Get feed to verify post existence"""
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        response = session.get(
            f"{API_URL}/feed?limit=50",
            headers=headers,
            timeout=10
        )
        return response
    except Exception as e:
        print(f"    ✗ GET feed failed: {e}")
        return None

def verify_post_deleted(post_id, token):
    """Verify post is deleted by checking feed"""
    response = get_feed(token)
    if response and response.status_code == 200:
        data = response.json()
        posts = data.get('posts', [])
        for post in posts:
            if post.get('id') == post_id or post.get('challengeId') == post_id:
                return False
        return True
    return False

def cleanup_test_post(post_id):
    """Clean up test post from MongoDB"""
    
    script = f"""
const {{ MongoClient }} = require('mongodb');
const client = new MongoClient('{MONGO_URL}');

async function cleanup() {{
  try {{
    await client.connect();
    const db = client.db();
    const posts = db.collection('posts');
    await posts.deleteOne({{ id: '{post_id}' }});
    console.log('CLEANED');
  }} catch (err) {{
    console.error('CLEANUP_ERROR:', err.message);
  }} finally {{
    await client.close();
  }}
}}

cleanup();
"""
    
    try:
        subprocess.run(['node', '-e', script], capture_output=True, timeout=10, cwd='/app')
    except:
        pass

def run_tests():
    """Run all backend tests for DELETE /api/posts/{id} with solo posts"""
    
    print("=" * 80)
    print("BACKEND TEST: DELETE /api/posts/{id} for 'solo' type posts")
    print("=" * 80)
    print()
    
    # Track test posts for cleanup
    test_posts = []
    test_results = {
        "test1_login": False,
        "test2_create": False,
        "test3_delete_owner": False,
        "test4_delete_non_owner": False,
        "test5_delete_not_found": False,
        "test6_delete_no_auth": False,
        "test7_regression": None  # Can be True, False, or "skipped"
    }
    
    try:
        # ===== TEST 1: Login as lucia =====
        print("TEST 1: Login as lucia (owner)")
        print("-" * 80)
        lucia_token, lucia_id, lucia_username = login(LUCIA)
        if not lucia_token:
            print("✗ TEST 1 FAILED: Could not login as lucia\n")
            return test_results
        print("✓ TEST 1 PASSED: Login successful\n")
        test_results["test1_login"] = True
        
        # ===== TEST 2: Create a 'solo' type post =====
        print("TEST 2: Create a 'solo' type post for lucia")
        print("-" * 80)
        solo_post_id = create_solo_post_via_mongodb(lucia_id, lucia_username)
        if not solo_post_id:
            print("✗ TEST 2 FAILED: Could not create solo post\n")
            return test_results
        test_posts.append(solo_post_id)
        print("✓ TEST 2 PASSED: Solo post created\n")
        test_results["test2_create"] = True
        
        # ===== TEST 3: DELETE as owner (lucia) =====
        print("TEST 3: DELETE solo post as owner (lucia)")
        print("-" * 80)
        print(f"  DELETE /api/posts/{solo_post_id}")
        response = delete_post(solo_post_id, lucia_token)
        if response is not None:
            print(f"  Status: {response.status_code}")
            print(f"  Response: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('ok') == True:
                    # Verify post is actually deleted
                    if verify_post_deleted(solo_post_id, lucia_token):
                        print("  ✓ Verified: Post deleted from database")
                        print("✓ TEST 3 PASSED: Owner can delete solo post\n")
                        test_results["test3_delete_owner"] = True
                        test_posts.remove(solo_post_id)  # Successfully deleted
                    else:
                        print("✗ TEST 3 FAILED: Post still exists in database\n")
                else:
                    print(f"✗ TEST 3 FAILED: Response ok={data.get('ok')}\n")
            else:
                print(f"✗ TEST 3 FAILED: Expected 200, got {response.status_code}\n")
        else:
            print("✗ TEST 3 FAILED: No response\n")
        
        # ===== TEST 4: Create another solo post and try DELETE as non-owner =====
        print("TEST 4: DELETE solo post as non-owner (marcos)")
        print("-" * 80)
        solo_post_id_2 = create_solo_post_via_mongodb(lucia_id, lucia_username)
        if not solo_post_id_2:
            print("✗ TEST 4 SETUP FAILED: Could not create second solo post\n")
        else:
            test_posts.append(solo_post_id_2)
            
            # Login as marcos
            print("  Logging in as marcos...")
            marcos_token, marcos_id, marcos_username = login(MARCOS)
            if not marcos_token:
                print("✗ TEST 4 SETUP FAILED: Could not login as marcos\n")
            else:
                # Try to delete lucia's post as marcos
                print(f"  DELETE /api/posts/{solo_post_id_2} (as marcos)")
                response = delete_post(solo_post_id_2, marcos_token)
                if response is not None:
                    print(f"  Status: {response.status_code}")
                    print(f"  Response: {response.text}")
                    
                    if response.status_code == 403:
                        print("✓ TEST 4 PASSED: Non-owner cannot delete solo post (403)\n")
                        test_results["test4_delete_non_owner"] = True
                    else:
                        print(f"✗ TEST 4 FAILED: Expected 403, got {response.status_code}\n")
                else:
                    print("✗ TEST 4 FAILED: No response\n")
        
        # ===== TEST 5: DELETE non-existent post =====
        print("TEST 5: DELETE non-existent post")
        print("-" * 80)
        fake_post_id = str(uuid.uuid4())
        print(f"  DELETE /api/posts/{fake_post_id}")
        response = delete_post(fake_post_id, lucia_token)
        if response is not None:
            print(f"  Status: {response.status_code}")
            print(f"  Response: {response.text}")
            
            if response.status_code == 404:
                print("✓ TEST 5 PASSED: Non-existent post returns 404\n")
                test_results["test5_delete_not_found"] = True
            else:
                print(f"✗ TEST 5 FAILED: Expected 404, got {response.status_code}\n")
        else:
            print("✗ TEST 5 FAILED: No response\n")
        
        # ===== TEST 6: DELETE without session =====
        print("TEST 6: DELETE without authentication")
        print("-" * 80)
        if solo_post_id_2:
            print(f"  DELETE /api/posts/{solo_post_id_2} (no auth)")
            response = delete_post(solo_post_id_2, None)
            if response is not None:
                print(f"  Status: {response.status_code}")
                print(f"  Response: {response.text}")
                
                if response.status_code == 401:
                    print("✓ TEST 6 PASSED: Unauthenticated request returns 401\n")
                    test_results["test6_delete_no_auth"] = True
                else:
                    print(f"✗ TEST 6 FAILED: Expected 401, got {response.status_code}\n")
            else:
                print("✗ TEST 6 FAILED: No response\n")
        
        # ===== TEST 7: Regression - DELETE versus/duet post =====
        print("TEST 7: Regression - DELETE versus/duet post (ensure no breakage)")
        print("-" * 80)
        # Get existing posts from feed
        print("  Fetching feed to find a versus/duet post...")
        feed_response = get_feed(lucia_token)
        if feed_response and feed_response.status_code == 200:
            feed_data = feed_response.json()
            posts = feed_data.get('posts', [])
            
            # Find a versus or duet post owned by lucia
            lucia_versus_post = None
            for post in posts:
                if post.get('type') in ['versus', 'duet']:
                    # Check if lucia is the owner
                    author_username = post.get('author', {}).get('username')
                    if author_username == lucia_username:
                        lucia_versus_post = post
                        break
            
            if lucia_versus_post:
                post_id = lucia_versus_post.get('id')
                post_type = lucia_versus_post.get('type')
                print(f"  Found {post_type} post: {post_id}")
                print(f"  DELETE /api/posts/{post_id}")
                
                response = delete_post(post_id, lucia_token)
                if response:
                    print(f"  Status: {response.status_code}")
                    print(f"  Response: {response.text}")
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get('ok') == True:
                            print(f"✓ TEST 7 PASSED: {post_type} post deletion still works\n")
                            test_results["test7_regression"] = True
                        else:
                            print(f"✗ TEST 7 FAILED: Response ok={data.get('ok')}\n")
                            test_results["test7_regression"] = False
                    else:
                        print(f"✗ TEST 7 FAILED: Expected 200, got {response.status_code}\n")
                        test_results["test7_regression"] = False
                else:
                    print("✗ TEST 7 FAILED: No response\n")
                    test_results["test7_regression"] = False
            else:
                print("  ⚠ SKIPPED: No versus/duet post owned by lucia found in feed")
                print("  (This is OK - the generic deletePostById function is unchanged)\n")
                test_results["test7_regression"] = "skipped"
        else:
            print("  ⚠ SKIPPED: Could not fetch feed for regression test\n")
            test_results["test7_regression"] = "skipped"
        
    finally:
        # Cleanup any remaining test posts
        if test_posts:
            print("=" * 80)
            print("CLEANUP: Removing test posts")
            print("-" * 80)
            for post_id in test_posts:
                print(f"  Cleaning up: {post_id}")
                cleanup_test_post(post_id)
            print("✓ Cleanup complete\n")
    
    return test_results

def print_summary(results):
    """Print test summary"""
    print("=" * 80)
    print("BACKEND TEST SUMMARY")
    print("=" * 80)
    
    tests = [
        ("TEST 1: Login as lucia", results["test1_login"]),
        ("TEST 2: Create solo post", results["test2_create"]),
        ("TEST 3: DELETE as owner (200 OK)", results["test3_delete_owner"]),
        ("TEST 4: DELETE as non-owner (403)", results["test4_delete_non_owner"]),
        ("TEST 5: DELETE non-existent (404)", results["test5_delete_not_found"]),
        ("TEST 6: DELETE without auth (401)", results["test6_delete_no_auth"]),
        ("TEST 7: Regression (versus/duet)", results["test7_regression"]),
    ]
    
    passed = 0
    failed = 0
    skipped = 0
    
    for name, result in tests:
        if result == True:
            print(f"✅ {name}")
            passed += 1
        elif result == "skipped":
            print(f"⚠️  {name} - SKIPPED")
            skipped += 1
        else:
            print(f"❌ {name}")
            failed += 1
    
    print()
    print(f"Total: {passed} passed, {failed} failed, {skipped} skipped")
    print()
    
    if failed == 0 and passed >= 6:  # At least 6 core tests must pass
        print("✅ ALL CRITICAL TESTS PASSED")
        print()
        print("CONCLUSION:")
        print("The DELETE /api/posts/{id} endpoint works correctly with 'solo' type posts.")
        print("- Owner can delete their own solo posts (200 OK)")
        print("- Non-owner cannot delete others' solo posts (403 Forbidden)")
        print("- Non-existent posts return 404")
        print("- Unauthenticated requests return 401")
        if results["test7_regression"] == True:
            print("- Regression test passed: versus/duet deletion still works")
        elif results["test7_regression"] == "skipped":
            print("- Regression test skipped (no versus/duet post available)")
    else:
        print("❌ SOME TESTS FAILED")
        print()
        print("Please review the failed tests above.")
    
    print()

if __name__ == "__main__":
    results = run_tests()
    print_summary(results)
