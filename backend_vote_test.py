#!/usr/bin/env python3
"""
Backend Vote Endpoint Sanity Check
===================================
Verifies /api/vote endpoint after frontend changes (no backend was touched).
Tests login, feed retrieval, voting behavior, and error handling.
"""

import requests
import json
import os

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')
API_BASE = f"{BASE_URL}/api"

print("=" * 80)
print("BACKEND VOTE ENDPOINT SANITY CHECK")
print("=" * 80)
print(f"API Base: {API_BASE}")
print()

# Test credentials from /app/memory/test_credentials.md
USERNAME = "lucia"
PASSWORD = "Test12345"

session = requests.Session()
token = None
post_to_test = None

# ============================================================================
# STEP 1: Login with lucia/Test12345
# ============================================================================
print("STEP 1: Login with lucia/Test12345")
print("-" * 80)

try:
    login_response = session.post(
        f"{API_BASE}/auth/login",
        json={"username": USERNAME, "password": PASSWORD},
        timeout=10
    )
    
    print(f"Status: {login_response.status_code}")
    
    if login_response.status_code == 200:
        login_data = login_response.json()
        if login_data.get('ok') and login_data.get('token'):
            token = login_data['token']
            print(f"✅ Login successful")
            print(f"   Token: {token[:20]}...")
            print(f"   User: {login_data.get('user', {}).get('username')}")
            print(f"   Session cookie set: {'session_token' in session.cookies}")
        else:
            print(f"❌ Login failed: {login_data}")
            exit(1)
    else:
        print(f"❌ Login failed with status {login_response.status_code}")
        print(f"   Response: {login_response.text}")
        exit(1)
        
except Exception as e:
    print(f"❌ Login request failed: {e}")
    exit(1)

print()

# ============================================================================
# STEP 2: Get feed and find a versus/duet post with votes
# ============================================================================
print("STEP 2: Get feed and find a versus/duet post")
print("-" * 80)

try:
    feed_response = session.get(
        f"{API_BASE}/feed?cursor=0&limit=8",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
    )
    
    print(f"Status: {feed_response.status_code}")
    
    if feed_response.status_code == 200:
        feed_data = feed_response.json()
        posts = feed_data.get('posts', [])
        print(f"✅ Feed retrieved successfully")
        print(f"   Total posts: {len(posts)}")
        
        # Find a versus or duet post with votes
        for post in posts:
            post_type = post.get('type')
            post_id = post.get('id')
            votes = post.get('votes', {})
            
            if post_type in ['versus', 'duet'] and votes:
                post_to_test = post
                print(f"   Found {post_type} post: {post_id}")
                print(f"   Initial votes: a={votes.get('a', 0)}, b={votes.get('b', 0)}")
                break
        
        if not post_to_test:
            print(f"⚠️  No versus/duet posts with votes found in feed")
            print(f"   Available posts: {[p.get('id') for p in posts]}")
            # Try to use any versus/duet post even without votes
            for post in posts:
                if post.get('type') in ['versus', 'duet']:
                    post_to_test = post
                    print(f"   Using post without votes: {post.get('id')}")
                    break
            
            if not post_to_test:
                print(f"❌ No versus/duet posts found at all")
                exit(1)
    else:
        print(f"❌ Feed request failed with status {feed_response.status_code}")
        print(f"   Response: {feed_response.text}")
        exit(1)
        
except Exception as e:
    print(f"❌ Feed request failed: {e}")
    exit(1)

print()

# ============================================================================
# STEP 3: Vote for side "a" and verify increment
# ============================================================================
print("STEP 3: Vote for side 'a'")
print("-" * 80)

post_id = post_to_test.get('id')
initial_votes = post_to_test.get('votes', {'a': 0, 'b': 0})
initial_a = initial_votes.get('a', 0)
initial_b = initial_votes.get('b', 0)

print(f"Post ID: {post_id}")
print(f"Initial votes: a={initial_a}, b={initial_b}")

try:
    vote_a_response = session.post(
        f"{API_BASE}/vote",
        json={"id": post_id, "side": "a"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
    )
    
    print(f"Status: {vote_a_response.status_code}")
    
    if vote_a_response.status_code == 200:
        vote_a_data = vote_a_response.json()
        new_votes = vote_a_data.get('votes', {})
        new_a = new_votes.get('a', 0)
        new_b = new_votes.get('b', 0)
        
        print(f"✅ Vote for side 'a' successful")
        print(f"   Response: {vote_a_data}")
        print(f"   New votes: a={new_a}, b={new_b}")
        
        # Verify that side 'a' incremented by 1
        if new_a == initial_a + 1:
            print(f"   ✅ Side 'a' incremented correctly (from {initial_a} to {new_a})")
        else:
            print(f"   ⚠️  Side 'a' increment unexpected: expected {initial_a + 1}, got {new_a}")
        
        if new_b == initial_b:
            print(f"   ✅ Side 'b' unchanged ({new_b})")
        else:
            print(f"   ⚠️  Side 'b' changed unexpectedly: was {initial_b}, now {new_b}")
            
        # Update for next test
        initial_a = new_a
        initial_b = new_b
    else:
        print(f"❌ Vote request failed with status {vote_a_response.status_code}")
        print(f"   Response: {vote_a_response.text}")
        exit(1)
        
except Exception as e:
    print(f"❌ Vote request failed: {e}")
    exit(1)

print()

# ============================================================================
# STEP 4: Vote for side "b" immediately and observe behavior
# ============================================================================
print("STEP 4: Vote for side 'b' immediately (observe behavior)")
print("-" * 80)

print(f"Current votes before 2nd vote: a={initial_a}, b={initial_b}")

try:
    vote_b_response = session.post(
        f"{API_BASE}/vote",
        json={"id": post_id, "side": "b"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
    )
    
    print(f"Status: {vote_b_response.status_code}")
    
    if vote_b_response.status_code == 200:
        vote_b_data = vote_b_response.json()
        final_votes = vote_b_data.get('votes', {})
        final_a = final_votes.get('a', 0)
        final_b = final_votes.get('b', 0)
        
        print(f"✅ Vote for side 'b' successful")
        print(f"   Response: {vote_b_data}")
        print(f"   Final votes: a={final_a}, b={final_b}")
        
        # Analyze behavior
        print()
        print("BEHAVIOR ANALYSIS:")
        
        if final_a == initial_a and final_b == initial_b + 1:
            print("   📊 Backend allows voting for different side: side 'b' incremented")
            print(f"      Side 'a': {initial_a} (unchanged)")
            print(f"      Side 'b': {initial_b} → {final_b} (+1)")
            print("   ℹ️  User can vote for both sides (no vote switching logic)")
            
        elif final_a == initial_a - 1 and final_b == initial_b + 1:
            print("   📊 Backend implements vote switching: side 'a' decremented, side 'b' incremented")
            print(f"      Side 'a': {initial_a} → {final_a} (-1)")
            print(f"      Side 'b': {initial_b} → {final_b} (+1)")
            print("   ℹ️  User can change their vote from one side to another")
            
        elif final_a == initial_a and final_b == initial_b:
            print("   📊 Backend ignores duplicate/conflicting votes")
            print(f"      Side 'a': {initial_a} (unchanged)")
            print(f"      Side 'b': {initial_b} (unchanged)")
            print("   ℹ️  User cannot vote again or change vote")
            
        else:
            print(f"   ⚠️  Unexpected behavior:")
            print(f"      Side 'a': {initial_a} → {final_a} (change: {final_a - initial_a})")
            print(f"      Side 'b': {initial_b} → {final_b} (change: {final_b - initial_b})")
            
    else:
        print(f"⚠️  Vote request returned status {vote_b_response.status_code}")
        print(f"   Response: {vote_b_response.text}")
        print("   ℹ️  Backend may reject duplicate votes with error status")
        
except Exception as e:
    print(f"❌ Vote request failed: {e}")
    exit(1)

print()

# ============================================================================
# STEP 5: Verify no regressions - test all endpoints again
# ============================================================================
print("STEP 5: Verify no regressions in endpoints")
print("-" * 80)

all_ok = True

# Test /api/auth/login again
try:
    login_check = session.post(
        f"{API_BASE}/auth/login",
        json={"username": USERNAME, "password": PASSWORD},
        timeout=10
    )
    if login_check.status_code == 200:
        print("✅ /api/auth/login - OK (200)")
    else:
        print(f"❌ /api/auth/login - FAILED ({login_check.status_code})")
        all_ok = False
except Exception as e:
    print(f"❌ /api/auth/login - ERROR: {e}")
    all_ok = False

# Test /api/feed again
try:
    feed_check = session.get(
        f"{API_BASE}/feed?cursor=0&limit=8",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
    )
    if feed_check.status_code == 200:
        print("✅ /api/feed - OK (200)")
    else:
        print(f"❌ /api/feed - FAILED ({feed_check.status_code})")
        all_ok = False
except Exception as e:
    print(f"❌ /api/feed - ERROR: {e}")
    all_ok = False

# Test /api/vote with invalid data (should return 400, not 500)
try:
    vote_invalid = session.post(
        f"{API_BASE}/vote",
        json={"id": "invalid", "side": "invalid"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
    )
    if vote_invalid.status_code == 400:
        print("✅ /api/vote (invalid data) - OK (400 as expected)")
    elif vote_invalid.status_code == 500:
        print(f"❌ /api/vote (invalid data) - SERVER ERROR (500)")
        all_ok = False
    else:
        print(f"⚠️  /api/vote (invalid data) - Unexpected status ({vote_invalid.status_code})")
except Exception as e:
    print(f"❌ /api/vote (invalid data) - ERROR: {e}")
    all_ok = False

print()
print("=" * 80)
if all_ok:
    print("✅ ALL TESTS PASSED - No regressions detected")
    print("   /api/auth/login: Working")
    print("   /api/feed: Working")
    print("   /api/vote: Working (no 500 errors)")
else:
    print("❌ SOME TESTS FAILED - Regressions detected")
print("=" * 80)
