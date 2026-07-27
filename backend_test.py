#!/usr/bin/env python3
"""
Backend test for the "challenge accepted" notification bug fix.

Bug: notifications of type 'accepted' were showing "@user" with a generic avatar 
(user field null) instead of the real accepter's username/name/avatar.

Root cause: handleAcceptChallenge used fromUserId: c.to?.id, and challenges created 
from the native app store targetAuthor WITHOUT an id, so c.to.id was undefined and 
createNotification returned fromUser=null.

Fix: now uses the authenticated accepter's id: 
`const accepter = await getCurrentUser(request)` and 
`fromUserId: accepter?.id || c.to?.id || null`.
"""

import requests
import json
import io
import time
import sys

# Base URL from .env
BASE_URL = "https://button-overlap-ui.preview.emergentagent.com/api"

def create_dummy_video():
    """Create a minimal dummy video file for testing"""
    # Minimal MP4 file (just a few bytes with proper header)
    mp4_header = b'\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6f\x6d\x00\x00\x02\x00'
    mp4_header += b'\x69\x73\x6f\x6d\x69\x73\x6f\x32\x6d\x70\x34\x31\x00\x00\x00\x08'
    mp4_header += b'\x66\x72\x65\x65' + b'\x00' * 100
    return io.BytesIO(mp4_header)

def register_user(username, password, name, email):
    """Register a new user and return session info"""
    print(f"\n[STEP] Registering user: {username}")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/register",
            json={
                "username": username,
                "password": password,
                "name": name,
                "email": email,
                "birthDate": "1990-01-01"  # Required for age gating (COPPA)
            },
            timeout=30
        )
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ User registered: {data.get('user', {}).get('username')}")
            
            # Extract token and cookie
            token = data.get('token')
            cookies = response.cookies
            
            return {
                'username': username,
                'token': token,
                'cookies': cookies,
                'user': data.get('user')
            }
        else:
            print(f"  ✗ Registration failed: {response.text}")
            return None
    except Exception as e:
        print(f"  ✗ Exception during registration: {e}")
        return None

def create_challenge(challenger_session, target_username, target_name):
    """Create a challenge as CHALLENGER against TARGET"""
    print(f"\n[STEP] Creating challenge from {challenger_session['username']} to {target_username}")
    
    try:
        # Create multipart form data
        # IMPORTANT: targetAuthor is a JSON STRING without "id" field (to reproduce native app case)
        target_author_json = json.dumps({
            "username": target_username,
            "name": target_name,
            "avatarUrl": ""
        })
        
        files = {
            'file': ('challenge.mp4', create_dummy_video(), 'video/mp4'),
        }
        
        data = {
            'targetAuthor': target_author_json,
            'message': '',
            'targetVideoUrl': '',
            'targetPosterUrl': '',
            'targetDescription': '',
            'targetMusic': ''
        }
        
        headers = {
            'Authorization': f"Bearer {challenger_session['token']}"
        }
        
        response = requests.post(
            f"{BASE_URL}/challenges",
            files=files,
            data=data,
            headers=headers,
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"  ✓ Challenge created: {result.get('challenge', {}).get('id')}")
            return result.get('challenge')
        else:
            print(f"  ✗ Challenge creation failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"  ✗ Exception during challenge creation: {e}")
        return None

def get_challenges(session, role='to'):
    """Get challenges for a user"""
    print(f"\n[STEP] Getting challenges for {session['username']} (role={role})")
    
    try:
        headers = {
            'Authorization': f"Bearer {session['token']}"
        }
        
        response = requests.get(
            f"{BASE_URL}/challenges?role={role}",
            headers=headers,
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            challenges = data.get('challenges', [])
            print(f"  ✓ Found {len(challenges)} challenge(s)")
            return challenges
        else:
            print(f"  ✗ Failed to get challenges: {response.text}")
            return []
            
    except Exception as e:
        print(f"  ✗ Exception getting challenges: {e}")
        return []

def accept_challenge(session, challenge_id):
    """Accept a challenge as TARGET"""
    print(f"\n[STEP] Accepting challenge {challenge_id} as {session['username']}")
    
    try:
        files = {
            'file': ('response.mp4', create_dummy_video(), 'video/mp4'),
        }
        
        headers = {
            'Authorization': f"Bearer {session['token']}"
        }
        
        response = requests.post(
            f"{BASE_URL}/challenges/{challenge_id}/accept",
            files=files,
            headers=headers,
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"  ✓ Challenge accepted, post created: {result.get('post', {}).get('id')}")
            return result.get('post')
        else:
            print(f"  ✗ Challenge acceptance failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"  ✗ Exception accepting challenge: {e}")
        return None

def get_notifications(session, filter_type='challenge'):
    """Get notifications for a user"""
    print(f"\n[STEP] Getting notifications for {session['username']} (filter={filter_type})")
    
    try:
        headers = {
            'Authorization': f"Bearer {session['token']}"
        }
        
        response = requests.get(
            f"{BASE_URL}/notifications?filter={filter_type}",
            headers=headers,
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            notifications = data.get('notifications', [])
            print(f"  ✓ Found {len(notifications)} notification(s)")
            return notifications
        else:
            print(f"  ✗ Failed to get notifications: {response.text}")
            return []
            
    except Exception as e:
        print(f"  ✗ Exception getting notifications: {e}")
        return []

def verify_accepted_notification(notifications, target_username, target_name):
    """Verify the 'accepted' notification has correct user data"""
    print(f"\n[VERIFICATION] Checking 'accepted' notification")
    
    # Find the 'accepted' notification
    accepted_notif = None
    for notif in notifications:
        if notif.get('type') == 'accepted':
            accepted_notif = notif
            break
    
    if not accepted_notif:
        print("  ✗ FAIL: No 'accepted' notification found")
        return False
    
    print(f"\n  Full notification object:")
    print(f"  {json.dumps(accepted_notif, indent=4)}")
    
    # Check user field
    user = accepted_notif.get('user')
    if user is None:
        print(f"\n  ✗ FAIL: user field is NULL (this is the bug!)")
        return False
    
    print(f"\n  ✓ PASS: user field is NOT null")
    
    # Check username
    notif_username = user.get('username')
    if not notif_username:
        print(f"  ✗ FAIL: user.username is missing or empty")
        return False
    
    if notif_username != target_username:
        print(f"  ✗ FAIL: user.username is '{notif_username}', expected '{target_username}'")
        return False
    
    print(f"  ✓ PASS: user.username = '{notif_username}' (correct)")
    
    # Check name
    notif_name = user.get('name')
    if not notif_name:
        print(f"  ✗ FAIL: user.name is missing or empty")
        return False
    
    print(f"  ✓ PASS: user.name = '{notif_name}' (present)")
    
    # Check avatarUrl field exists
    if 'avatarUrl' not in user:
        print(f"  ✗ FAIL: user.avatarUrl field is missing")
        return False
    
    print(f"  ✓ PASS: user.avatarUrl field is present")
    
    # Check text
    text = accepted_notif.get('text')
    if 'accepted your challenge' not in text:
        print(f"  ✗ FAIL: text is '{text}', expected to contain 'accepted your challenge'")
        return False
    
    print(f"  ✓ PASS: text = '{text}' (correct)")
    
    print(f"\n  ✅ ALL CHECKS PASSED: The 'accepted' notification has correct user data!")
    return True

def test_regression_all_notifications(session):
    """Regression test: GET /api/notifications (filter=all) should work"""
    print(f"\n[REGRESSION] Testing GET /api/notifications (filter=all)")
    
    try:
        headers = {
            'Authorization': f"Bearer {session['token']}"
        }
        
        response = requests.get(
            f"{BASE_URL}/notifications",
            headers=headers,
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if 'notifications' in data and isinstance(data['notifications'], list):
                print(f"  ✓ PASS: Returns proper list with {len(data['notifications'])} notification(s)")
                return True
            else:
                print(f"  ✗ FAIL: Response format incorrect: {data}")
                return False
        else:
            print(f"  ✗ FAIL: Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print(f"  ✗ FAIL: Exception: {e}")
        return False

def main():
    print("=" * 80)
    print("BACKEND TEST: Challenge Accepted Notification Bug Fix")
    print("=" * 80)
    
    # Generate unique usernames to avoid conflicts
    timestamp = int(time.time())
    challenger_username = f"challenger_{timestamp}"
    target_username = f"target_{timestamp}"
    
    # Step 1: Register two users
    print("\n" + "=" * 80)
    print("STEP 1: Register two fresh users (CHALLENGER and TARGET)")
    print("=" * 80)
    
    challenger = register_user(
        username=challenger_username,
        password="Test12345",
        name="Challenger User",
        email=f"{challenger_username}@test.com"
    )
    
    if not challenger:
        print("\n✗ TEST FAILED: Could not register CHALLENGER")
        sys.exit(1)
    
    target = register_user(
        username=target_username,
        password="Test12345",
        name="Target User",
        email=f"{target_username}@test.com"
    )
    
    if not target:
        print("\n✗ TEST FAILED: Could not register TARGET")
        sys.exit(1)
    
    # Step 2: Create challenge
    print("\n" + "=" * 80)
    print("STEP 2: CHALLENGER creates a challenge against TARGET")
    print("        (targetAuthor WITHOUT id field to reproduce native app case)")
    print("=" * 80)
    
    challenge = create_challenge(challenger, target_username, target['user']['name'])
    
    if not challenge:
        print("\n✗ TEST FAILED: Could not create challenge")
        sys.exit(1)
    
    # Step 3: Get challenge ID
    print("\n" + "=" * 80)
    print("STEP 3: TARGET fetches pending challenges")
    print("=" * 80)
    
    challenges = get_challenges(target, role='to')
    
    if not challenges:
        print("\n✗ TEST FAILED: No challenges found for TARGET")
        sys.exit(1)
    
    challenge_id = challenges[0].get('id')
    print(f"\n  Challenge ID: {challenge_id}")
    
    # Step 4: Accept challenge
    print("\n" + "=" * 80)
    print("STEP 4: TARGET accepts the challenge")
    print("=" * 80)
    
    post = accept_challenge(target, challenge_id)
    
    if not post:
        print("\n✗ TEST FAILED: Could not accept challenge")
        sys.exit(1)
    
    # Give the notification system a moment to process
    time.sleep(1)
    
    # Step 5: Verify notification
    print("\n" + "=" * 80)
    print("STEP 5: CHALLENGER fetches notifications and verifies 'accepted' notification")
    print("=" * 80)
    
    notifications = get_notifications(challenger, filter_type='challenge')
    
    if not notifications:
        print("\n✗ TEST FAILED: No notifications found for CHALLENGER")
        sys.exit(1)
    
    success = verify_accepted_notification(notifications, target_username, target['user']['name'])
    
    if not success:
        print("\n" + "=" * 80)
        print("✗ TEST FAILED: Notification verification failed")
        print("=" * 80)
        sys.exit(1)
    
    # Step 6: Regression test
    print("\n" + "=" * 80)
    print("STEP 6: Regression test - GET /api/notifications (filter=all)")
    print("=" * 80)
    
    regression_success = test_regression_all_notifications(challenger)
    
    if not regression_success:
        print("\n✗ REGRESSION TEST FAILED")
        sys.exit(1)
    
    # All tests passed
    print("\n" + "=" * 80)
    print("✅ ALL TESTS PASSED!")
    print("=" * 80)
    print("\nSummary:")
    print("  ✓ Registered two users successfully")
    print("  ✓ Created challenge with targetAuthor WITHOUT id field")
    print("  ✓ Accepted challenge successfully")
    print("  ✓ 'accepted' notification has correct user data:")
    print(f"    - user is NOT null")
    print(f"    - user.username = '{target_username}'")
    print(f"    - user.name is present")
    print(f"    - user.avatarUrl field is present")
    print(f"    - text contains 'accepted your challenge'")
    print("  ✓ Regression test passed (GET /api/notifications works)")
    print("\n🎉 The notification bug fix is working correctly!")
    print("=" * 80)

if __name__ == "__main__":
    main()
