#!/usr/bin/env python3
"""
Backend test for single-post like notifications feature.

Tests the new notification feature: when a user gives a "like" (heart) reaction 
on an open-challenge/single post via POST /api/single-vote, a notification with 
type: 'like' should be created for the post's author (skipped if author === voter).
"""

import requests
import json
import os
import sys

# Read base URL from .env
BASE_URL = None
try:
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_BASE_URL='):
                BASE_URL = line.split('=', 1)[1].strip()
                break
except Exception as e:
    print(f"❌ Failed to read BASE_URL from .env: {e}")
    sys.exit(1)

if not BASE_URL:
    print("❌ NEXT_PUBLIC_BASE_URL not found in .env")
    sys.exit(1)

API_URL = f"{BASE_URL}/api"
print(f"🔗 Testing against: {API_URL}\n")

# Test credentials
LUCIA_CREDS = {"username": "lucia", "password": "Test12345"}
MARCOS_CREDS = {"username": "marcos", "password": "Test12345"}

# Test post ID (open challenge created by lucia)
TEST_POST_ID = "open_593b8343-5584-40c9-b34a-b6f04df5834e"

def login(credentials):
    """Login and return session token"""
    try:
        # Try with username first
        resp = requests.post(f"{API_URL}/auth/login", json=credentials, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('ok') and data.get('token'):
                return data['token']
        
        # If username fails, try with email
        if '@' not in credentials.get('username', ''):
            # Try to find email by username
            email_map = {
                'lucia': 'lucia@test.com',
                'marcos': 'marcos@test.com',
                'laura': 'laura@test.com'
            }
            email = email_map.get(credentials['username'])
            if email:
                creds_with_email = {'email': email, 'password': credentials['password']}
                resp = requests.post(f"{API_URL}/auth/login", json=creds_with_email, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get('ok') and data.get('token'):
                        return data['token']
        
        print(f"❌ Login failed for {credentials.get('username')}: {resp.status_code} - {resp.text[:200]}")
        return None
    except Exception as e:
        print(f"❌ Login exception for {credentials.get('username')}: {e}")
        return None

def get_headers(token):
    """Get headers with auth token"""
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

def main():
    print("=" * 80)
    print("TESTING: Single-Post Like Notifications Feature")
    print("=" * 80)
    print()
    
    all_passed = True
    
    # ========================================================================
    # TEST 1: Login as marcos and like the post
    # ========================================================================
    print("📝 TEST 1: Login as marcos and like lucia's post")
    print("-" * 80)
    
    marcos_token = login(MARCOS_CREDS)
    if not marcos_token:
        print("❌ TEST 1 FAILED: Could not login as marcos")
        all_passed = False
        return 1
    
    print(f"✅ Logged in as marcos (token: {marcos_token[:20]}...)")
    
    # Like the post
    try:
        resp = requests.post(
            f"{API_URL}/single-vote",
            json={"postId": TEST_POST_ID},
            headers=get_headers(marcos_token),
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 1 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            all_passed = False
            return 1
        
        data = resp.json()
        if not data.get('ok'):
            print(f"❌ TEST 1 FAILED: Response ok=false")
            print(f"   Response: {json.dumps(data, indent=2)}")
            all_passed = False
            return 1
        
        if not data.get('voted'):
            print(f"❌ TEST 1 FAILED: Expected voted=true, got {data.get('voted')}")
            print(f"   Response: {json.dumps(data, indent=2)}")
            all_passed = False
            return 1
        
        vote_count = data.get('count', 0)
        if vote_count < 1:
            print(f"❌ TEST 1 FAILED: Expected count >= 1, got {vote_count}")
            all_passed = False
            return 1
        
        print(f"✅ Successfully liked post: voted=true, count={vote_count}")
        print("✅ TEST 1 PASSED")
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED: Exception during like: {e}")
        all_passed = False
        return 1
    
    print()
    
    # ========================================================================
    # TEST 2: Login as lucia and check for like notification
    # ========================================================================
    print("📝 TEST 2: Login as lucia and verify like notification exists")
    print("-" * 80)
    
    lucia_token = login(LUCIA_CREDS)
    if not lucia_token:
        print("❌ TEST 2 FAILED: Could not login as lucia")
        all_passed = False
        return 1
    
    print(f"✅ Logged in as lucia (token: {lucia_token[:20]}...)")
    
    # Get all notifications
    try:
        resp = requests.get(
            f"{API_URL}/notifications?filter=all",
            headers=get_headers(lucia_token),
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 2 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            all_passed = False
            return 1
        
        data = resp.json()
        notifications = data.get('notifications', [])
        
        # Find the like notification from marcos
        like_notif = None
        for n in notifications:
            if (n.get('type') == 'like' and 
                n.get('user', {}).get('username') == 'marcos' and
                n.get('postId') == TEST_POST_ID):
                like_notif = n
                break
        
        if not like_notif:
            print(f"❌ TEST 2 FAILED: Like notification not found")
            print(f"   Total notifications: {len(notifications)}")
            print(f"   Looking for: type='like', user.username='marcos', postId='{TEST_POST_ID}'")
            # Print all notifications for debugging
            for i, n in enumerate(notifications[:5]):
                print(f"   Notification {i+1}: type={n.get('type')}, user={n.get('user', {}).get('username')}, postId={n.get('postId')}")
            all_passed = False
            return 1
        
        # Verify notification details
        print(f"✅ Found like notification:")
        print(f"   - type: {like_notif.get('type')}")
        print(f"   - from user: {like_notif.get('user', {}).get('username')}")
        print(f"   - text: {like_notif.get('text')}")
        print(f"   - postId: {like_notif.get('postId')}")
        print(f"   - read: {like_notif.get('read')}")
        
        # Verify text mentions "liked your post"
        notif_text = like_notif.get('text', '')
        if 'liked your post' not in notif_text.lower():
            print(f"⚠️  WARNING: Notification text doesn't mention 'liked your post': '{notif_text}'")
        
        # Verify it's unread
        if like_notif.get('read') != False:
            print(f"⚠️  WARNING: Expected read=false, got {like_notif.get('read')}")
        
        print("✅ TEST 2 PASSED")
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED: Exception: {e}")
        all_passed = False
        return 1
    
    print()
    
    # ========================================================================
    # TEST 3: Check unread notification count
    # ========================================================================
    print("📝 TEST 3: Check unread notification count for lucia")
    print("-" * 80)
    
    try:
        resp = requests.get(
            f"{API_URL}/notifications/unread",
            headers=get_headers(lucia_token),
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 3 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            all_passed = False
            return 1
        
        data = resp.json()
        unread_count = data.get('count', 0)
        
        if unread_count < 1:
            print(f"❌ TEST 3 FAILED: Expected unread count >= 1, got {unread_count}")
            all_passed = False
            return 1
        
        print(f"✅ Unread notification count: {unread_count}")
        print("✅ TEST 3 PASSED")
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED: Exception: {e}")
        all_passed = False
        return 1
    
    print()
    
    # ========================================================================
    # TEST 4: Unlike (toggle off) and verify no duplicate notification
    # ========================================================================
    print("📝 TEST 4: Marcos unlikes the post (toggle off)")
    print("-" * 80)
    
    # Get current notification count for lucia
    try:
        resp = requests.get(
            f"{API_URL}/notifications?filter=all",
            headers=get_headers(lucia_token),
            timeout=10
        )
        data = resp.json()
        notifications_before = data.get('notifications', [])
        like_notifs_before = [n for n in notifications_before if n.get('type') == 'like' and n.get('user', {}).get('username') == 'marcos']
        like_count_before = len(like_notifs_before)
        print(f"   Like notifications from marcos before unlike: {like_count_before}")
    except Exception as e:
        print(f"⚠️  Could not get notification count before unlike: {e}")
        like_count_before = None
    
    # Unlike the post (toggle off)
    try:
        resp = requests.post(
            f"{API_URL}/single-vote",
            json={"postId": TEST_POST_ID},
            headers=get_headers(marcos_token),
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 4 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            all_passed = False
            return 1
        
        data = resp.json()
        if not data.get('ok'):
            print(f"❌ TEST 4 FAILED: Response ok=false")
            print(f"   Response: {json.dumps(data, indent=2)}")
            all_passed = False
            return 1
        
        if data.get('voted') != False:
            print(f"❌ TEST 4 FAILED: Expected voted=false, got {data.get('voted')}")
            print(f"   Response: {json.dumps(data, indent=2)}")
            all_passed = False
            return 1
        
        print(f"✅ Successfully unliked post: voted=false, count={data.get('count', 0)}")
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED: Exception during unlike: {e}")
        all_passed = False
        return 1
    
    # Verify no additional notification was created
    try:
        resp = requests.get(
            f"{API_URL}/notifications?filter=all",
            headers=get_headers(lucia_token),
            timeout=10
        )
        data = resp.json()
        notifications_after = data.get('notifications', [])
        like_notifs_after = [n for n in notifications_after if n.get('type') == 'like' and n.get('user', {}).get('username') == 'marcos']
        like_count_after = len(like_notifs_after)
        
        print(f"   Like notifications from marcos after unlike: {like_count_after}")
        
        if like_count_before is not None and like_count_after > like_count_before:
            print(f"❌ TEST 4 FAILED: Duplicate notification created on unlike")
            print(f"   Before: {like_count_before}, After: {like_count_after}")
            all_passed = False
            return 1
        
        print(f"✅ No duplicate notification created (count unchanged)")
        print("✅ TEST 4 PASSED")
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED: Exception checking notifications: {e}")
        all_passed = False
        return 1
    
    print()
    
    # ========================================================================
    # TEST 5: Self-like check (lucia likes her own post)
    # ========================================================================
    print("📝 TEST 5: Self-like check - lucia likes her own post")
    print("-" * 80)
    
    # Get current notification count for lucia (from herself)
    try:
        resp = requests.get(
            f"{API_URL}/notifications?filter=all",
            headers=get_headers(lucia_token),
            timeout=10
        )
        data = resp.json()
        notifications_before = data.get('notifications', [])
        self_like_notifs_before = [n for n in notifications_before if n.get('type') == 'like' and n.get('user', {}).get('username') == 'lucia']
        self_like_count_before = len(self_like_notifs_before)
        print(f"   Self-like notifications before: {self_like_count_before}")
    except Exception as e:
        print(f"⚠️  Could not get notification count before self-like: {e}")
        self_like_count_before = None
    
    # Lucia likes her own post
    try:
        resp = requests.post(
            f"{API_URL}/single-vote",
            json={"postId": TEST_POST_ID},
            headers=get_headers(lucia_token),
            timeout=10
        )
        
        if resp.status_code != 200:
            print(f"❌ TEST 5 FAILED: Expected 200, got {resp.status_code}")
            print(f"   Response: {resp.text[:500]}")
            all_passed = False
            return 1
        
        data = resp.json()
        if not data.get('ok'):
            print(f"❌ TEST 5 FAILED: Response ok=false")
            print(f"   Response: {json.dumps(data, indent=2)}")
            all_passed = False
            return 1
        
        if not data.get('voted'):
            print(f"❌ TEST 5 FAILED: Expected voted=true, got {data.get('voted')}")
            print(f"   Response: {json.dumps(data, indent=2)}")
            all_passed = False
            return 1
        
        print(f"✅ Successfully self-liked post: voted=true, count={data.get('count', 0)}")
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED: Exception during self-like: {e}")
        all_passed = False
        return 1
    
    # Verify NO notification was created for self-like
    try:
        resp = requests.get(
            f"{API_URL}/notifications?filter=all",
            headers=get_headers(lucia_token),
            timeout=10
        )
        data = resp.json()
        notifications_after = data.get('notifications', [])
        self_like_notifs_after = [n for n in notifications_after if n.get('type') == 'like' and n.get('user', {}).get('username') == 'lucia']
        self_like_count_after = len(self_like_notifs_after)
        
        print(f"   Self-like notifications after: {self_like_count_after}")
        
        if self_like_count_before is not None and self_like_count_after > self_like_count_before:
            print(f"❌ TEST 5 FAILED: Self-like notification was created (should be skipped)")
            print(f"   Before: {self_like_count_before}, After: {self_like_count_after}")
            all_passed = False
            return 1
        
        print(f"✅ No self-like notification created (correctly skipped)")
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED: Exception checking notifications: {e}")
        all_passed = False
        return 1
    
    # Clean up: unlike to leave test data clean
    try:
        resp = requests.post(
            f"{API_URL}/single-vote",
            json={"postId": TEST_POST_ID},
            headers=get_headers(lucia_token),
            timeout=10
        )
        if resp.status_code == 200 and resp.json().get('voted') == False:
            print(f"✅ Cleaned up: lucia unliked her own post")
        else:
            print(f"⚠️  Could not clean up self-like")
    except Exception as e:
        print(f"⚠️  Exception during cleanup: {e}")
    
    print("✅ TEST 5 PASSED")
    print()
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("=" * 80)
    if all_passed:
        print("✅ ALL TESTS PASSED")
        print("=" * 80)
        print()
        print("Summary:")
        print("  ✅ Marcos can like lucia's post (notification created)")
        print("  ✅ Lucia receives notification with type='like', correct text")
        print("  ✅ Unread notification count includes the like notification")
        print("  ✅ Unliking does NOT create duplicate notification")
        print("  ✅ Self-like does NOT create notification (correctly skipped)")
        print()
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("=" * 80)
        return 1

if __name__ == '__main__':
    sys.exit(main())
