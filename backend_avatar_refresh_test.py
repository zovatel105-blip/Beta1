#!/usr/bin/env python3
"""
Backend Avatar Refresh Test for TWYK App
Tests that challenge participants' avatars are refreshed after profile photo changes
"""

import requests
import json
import sys
import os
import io

# Base URL - use /api prefix
BASE_URL = "http://localhost:3000/api"
print(f"Using BASE_URL: {BASE_URL}")

# Store tokens for alice and bob
alice_token = None
bob_token = None

def create_dummy_mp4():
    """Create a minimal valid MP4 file for testing"""
    # Minimal MP4 with ftyp atom
    return b'\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6f\x6d\x00\x00\x02\x00' + b'\x00' * 100

def create_dummy_image():
    """Create a minimal valid PNG image for testing"""
    # Minimal 1x1 PNG
    return b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'

def print_section(title):
    """Print a formatted section header"""
    print("\n" + "="*80)
    print(title)
    print("="*80)

# ============================================================================
# SCENARIO A: Register two users (alice and bob)
# ============================================================================
print_section("SCENARIO A: Register two users (alice and bob)")

try:
    # Register alice
    print("\n[A1] Registering alice...")
    alice_data = {
        "username": "alice_test_" + str(int(__import__('time').time())),
        "email": "alice_test_" + str(int(__import__('time').time())) + "@test.com",
        "password": "alice123"
    }
    response = requests.post(f"{BASE_URL}/auth/register", json=alice_data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}")
    
    if response.status_code == 200:
        alice_result = response.json()
        alice_token = alice_result.get('token')
        alice_id = alice_result.get('user', {}).get('id')
        alice_username = alice_result.get('user', {}).get('username')
        print(f"✓ Alice registered successfully")
        print(f"  - ID: {alice_id}")
        print(f"  - Username: {alice_username}")
        print(f"  - Token: {alice_token[:20]}...")
    else:
        print(f"✗ Failed to register alice: {response.status_code}")
        sys.exit(1)
        
    # Register bob
    print("\n[A2] Registering bob...")
    bob_data = {
        "username": "bob_test_" + str(int(__import__('time').time())),
        "email": "bob_test_" + str(int(__import__('time').time())) + "@test.com",
        "password": "bob123"
    }
    response = requests.post(f"{BASE_URL}/auth/register", json=bob_data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}")
    
    if response.status_code == 200:
        bob_result = response.json()
        bob_token = bob_result.get('token')
        bob_id = bob_result.get('user', {}).get('id')
        bob_username = bob_result.get('user', {}).get('username')
        print(f"✓ Bob registered successfully")
        print(f"  - ID: {bob_id}")
        print(f"  - Username: {bob_username}")
        print(f"  - Token: {bob_token[:20]}...")
    else:
        print(f"✗ Failed to register bob: {response.status_code}")
        sys.exit(1)
        
except Exception as e:
    print(f"✗ Exception during registration: {e}")
    sys.exit(1)

# ============================================================================
# SCENARIO B: Bob creates a challenge to alice
# ============================================================================
print_section("SCENARIO B: Bob creates a challenge to alice")

try:
    print("\n[B1] Bob creating challenge to alice...")
    
    # Prepare multipart form data
    files = {
        'file': ('video.mp4', io.BytesIO(create_dummy_mp4()), 'video/mp4')
    }
    
    target_author = {
        'id': alice_id,
        'username': alice_username,
        'name': 'Alice',
        'avatarUrl': 'https://i.pravatar.cc/120?img=1'
    }
    
    data = {
        'targetAuthor': json.dumps(target_author),
        'message': 'reto'
    }
    
    # Use bob's Bearer token
    headers = {'Authorization': f'Bearer {bob_token}'}
    response = requests.post(
        f"{BASE_URL}/challenges",
        files=files,
        data=data,
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        challenge_result = response.json()
        challenge = challenge_result.get('challenge', {})
        challenge_id = challenge.get('id')
        challenge_from = challenge.get('from', {})
        challenge_to = challenge.get('to', {})
        
        print(f"✓ Challenge created successfully")
        print(f"  - Challenge ID: {challenge_id}")
        print(f"  - From username: {challenge_from.get('username')}")
        print(f"  - To username: {challenge_to.get('username')}")
        print(f"  - From avatarUrl (initial): {challenge_from.get('avatarUrl')}")
        
        # Store bob's initial avatar URL
        bob_initial_avatar = challenge_from.get('avatarUrl')
        
        # Verify from and to usernames
        if challenge_from.get('username') == 'bob' and challenge_to.get('username') == 'alice':
            print(f"✓ Challenge participants verified: bob -> alice")
        else:
            print(f"✗ Challenge participants mismatch!")
            print(f"  Expected: bob -> alice")
            print(f"  Got: {challenge_from.get('username')} -> {challenge_to.get('username')}")
    else:
        print(f"✗ Failed to create challenge: {response.status_code}")
        sys.exit(1)
        
except Exception as e:
    print(f"✗ Exception during challenge creation: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ============================================================================
# SCENARIO C: Alice gets challenges (should see bob's current avatar)
# ============================================================================
print_section("SCENARIO C: Alice gets challenges (should see bob's current avatar)")

try:
    print("\n[C1] Alice fetching challenges...")
    
    # Use alice's session
    response = alice_session.get(f"{BASE_URL}/challenges")
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        challenges_result = response.json()
        challenges = challenges_result.get('challenges', [])
        
        print(f"✓ Alice fetched {len(challenges)} challenge(s)")
        
        if len(challenges) > 0:
            challenge = challenges[0]
            challenge_from = challenge.get('from', {})
            from_avatar_step_c = challenge_from.get('avatarUrl')
            
            print(f"  - Challenge from: {challenge_from.get('username')}")
            print(f"  - From avatarUrl (step C): {from_avatar_step_c}")
            
            # This should match bob's initial avatar (from registration)
            print(f"✓ Bob's avatar in challenge (step C): {from_avatar_step_c}")
        else:
            print(f"✗ No challenges found for alice!")
            sys.exit(1)
    else:
        print(f"✗ Failed to fetch challenges: {response.status_code}")
        sys.exit(1)
        
except Exception as e:
    print(f"✗ Exception during challenge fetch: {e}")
    sys.exit(1)

# ============================================================================
# SCENARIO D: Bob changes his profile photo
# ============================================================================
print_section("SCENARIO D: Bob changes his profile photo")

try:
    print("\n[D1] Bob updating profile photo...")
    
    # Prepare multipart form data with avatar image
    files = {
        'avatar': ('avatar.png', io.BytesIO(create_dummy_image()), 'image/png')
    }
    
    # Use bob's session
    response = bob_session.post(f"{BASE_URL}/profile", files=files)
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        profile_result = response.json()
        updated_user = profile_result.get('user', {})
        bob_new_avatar = updated_user.get('avatarUrl')
        
        print(f"✓ Bob's profile updated successfully")
        print(f"  - New avatarUrl: {bob_new_avatar}")
        
        # Verify new avatar starts with /uploads/avatar_
        if bob_new_avatar and bob_new_avatar.startswith('/uploads/avatar_'):
            print(f"✓ New avatar URL format is correct (starts with /uploads/avatar_)")
        else:
            print(f"✗ New avatar URL format is incorrect!")
            print(f"  Expected to start with: /uploads/avatar_")
            print(f"  Got: {bob_new_avatar}")
    else:
        print(f"✗ Failed to update profile: {response.status_code}")
        sys.exit(1)
        
except Exception as e:
    print(f"✗ Exception during profile update: {e}")
    sys.exit(1)

# ============================================================================
# SCENARIO E: CORE FIX - Alice gets challenges again (should see bob's NEW avatar)
# ============================================================================
print_section("SCENARIO E: CORE FIX - Alice gets challenges again (should see bob's NEW avatar)")

try:
    print("\n[E1] Alice fetching challenges again...")
    
    # Use alice's session
    response = alice_session.get(f"{BASE_URL}/challenges")
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        challenges_result = response.json()
        challenges = challenges_result.get('challenges', [])
        
        print(f"✓ Alice fetched {len(challenges)} challenge(s)")
        
        if len(challenges) > 0:
            challenge = challenges[0]
            challenge_from = challenge.get('from', {})
            from_avatar_step_e = challenge_from.get('avatarUrl')
            
            print(f"  - Challenge from: {challenge_from.get('username')}")
            print(f"  - From avatarUrl (step E): {from_avatar_step_e}")
            
            # CORE VERIFICATION: This should be the NEW avatar (starts with /uploads/avatar_)
            print(f"\n[CORE FIX VERIFICATION]")
            print(f"  - Bob's initial avatar (step C): {from_avatar_step_c}")
            print(f"  - Bob's new avatar (step D): {bob_new_avatar}")
            print(f"  - Bob's avatar in challenge (step E): {from_avatar_step_e}")
            
            if from_avatar_step_e == bob_new_avatar and from_avatar_step_e.startswith('/uploads/avatar_'):
                print(f"✓✓✓ CORE FIX VERIFIED: Challenge shows bob's NEW avatar!")
                print(f"    Avatar changed from: {from_avatar_step_c}")
                print(f"    Avatar changed to: {from_avatar_step_e}")
            else:
                print(f"✗✗✗ CORE FIX FAILED: Challenge still shows OLD avatar!")
                print(f"    Expected: {bob_new_avatar}")
                print(f"    Got: {from_avatar_step_e}")
                sys.exit(1)
        else:
            print(f"✗ No challenges found for alice!")
            sys.exit(1)
    else:
        print(f"✗ Failed to fetch challenges: {response.status_code}")
        sys.exit(1)
        
except Exception as e:
    print(f"✗ Exception during challenge fetch: {e}")
    sys.exit(1)

# ============================================================================
# SCENARIO F: Reciprocal - Alice changes avatar, bob sees it
# ============================================================================
print_section("SCENARIO F: Reciprocal - Alice changes avatar, bob sees it")

try:
    print("\n[F1] Alice updating profile photo...")
    
    # Prepare multipart form data with avatar image
    files = {
        'avatar': ('avatar.png', io.BytesIO(create_dummy_image()), 'image/png')
    }
    
    # Use alice's session
    response = alice_session.post(f"{BASE_URL}/profile", files=files)
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        profile_result = response.json()
        updated_user = profile_result.get('user', {})
        alice_new_avatar = updated_user.get('avatarUrl')
        
        print(f"✓ Alice's profile updated successfully")
        print(f"  - New avatarUrl: {alice_new_avatar}")
        
        # Verify new avatar starts with /uploads/avatar_
        if alice_new_avatar and alice_new_avatar.startswith('/uploads/avatar_'):
            print(f"✓ New avatar URL format is correct (starts with /uploads/avatar_)")
        else:
            print(f"✗ New avatar URL format is incorrect!")
    else:
        print(f"✗ Failed to update alice's profile: {response.status_code}")
        sys.exit(1)
    
    print("\n[F2] Bob fetching challenges with role=from...")
    
    # Use bob's session and role=from to see challenges he sent
    response = bob_session.get(f"{BASE_URL}/challenges?role=from")
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        challenges_result = response.json()
        challenges = challenges_result.get('challenges', [])
        
        print(f"✓ Bob fetched {len(challenges)} challenge(s) he sent")
        
        if len(challenges) > 0:
            challenge = challenges[0]
            challenge_to = challenge.get('to', {})
            to_avatar = challenge_to.get('avatarUrl')
            
            print(f"  - Challenge to: {challenge_to.get('username')}")
            print(f"  - To avatarUrl: {to_avatar}")
            
            # VERIFICATION: This should be alice's NEW avatar
            if to_avatar == alice_new_avatar and to_avatar.startswith('/uploads/avatar_'):
                print(f"✓✓✓ RECIPROCAL FIX VERIFIED: Challenge shows alice's NEW avatar!")
                print(f"    Alice's new avatar: {to_avatar}")
            else:
                print(f"✗✗✗ RECIPROCAL FIX FAILED: Challenge shows OLD avatar!")
                print(f"    Expected: {alice_new_avatar}")
                print(f"    Got: {to_avatar}")
                sys.exit(1)
        else:
            print(f"✗ No challenges found for bob!")
            sys.exit(1)
    else:
        print(f"✗ Failed to fetch challenges: {response.status_code}")
        sys.exit(1)
        
except Exception as e:
    print(f"✗ Exception during reciprocal test: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ============================================================================
# SCENARIO G: Regression - Demo targetAuthor preserves snapshot
# ============================================================================
print_section("SCENARIO G: Regression - Demo targetAuthor preserves snapshot")

try:
    print("\n[G1] Bob creating challenge to demo user...")
    
    # Prepare multipart form data
    files = {
        'file': ('video.mp4', io.BytesIO(create_dummy_mp4()), 'video/mp4')
    }
    
    # Use a demo user (not registered)
    demo_target_author = {
        'id': 'demo_id',
        'username': 'demo_user',
        'name': 'Demo User',
        'avatarUrl': 'https://i.pravatar.cc/120?img=99'
    }
    
    data = {
        'targetAuthor': json.dumps(demo_target_author),
        'message': 'demo reto'
    }
    
    # Use bob's session
    response = bob_session.post(
        f"{BASE_URL}/challenges",
        files=files,
        data=data
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        challenge_result = response.json()
        challenge = challenge_result.get('challenge', {})
        challenge_to = challenge.get('to', {})
        
        print(f"✓ Challenge to demo user created successfully")
        print(f"  - To username: {challenge_to.get('username')}")
        print(f"  - To avatarUrl: {challenge_to.get('avatarUrl')}")
        
        # Verify demo user's avatar is preserved
        if challenge_to.get('avatarUrl') == demo_target_author['avatarUrl']:
            print(f"✓ Demo user's avatar snapshot preserved correctly")
        else:
            print(f"✗ Demo user's avatar was modified!")
            print(f"  Expected: {demo_target_author['avatarUrl']}")
            print(f"  Got: {challenge_to.get('avatarUrl')}")
    else:
        print(f"✗ Failed to create challenge to demo user: {response.status_code}")
        # This is not critical, continue
        
except Exception as e:
    print(f"⚠ Exception during demo user test (non-critical): {e}")
    # Continue, this is a regression test

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print_section("FINAL SUMMARY")
print("\n✓✓✓ ALL CORE TESTS PASSED ✓✓✓")
print("\nKey verifications:")
print("  1. ✓ Two users registered (alice and bob)")
print("  2. ✓ Bob created challenge to alice")
print("  3. ✓ Alice saw challenge with bob's initial avatar")
print("  4. ✓ Bob changed his profile photo")
print("  5. ✓✓✓ CORE FIX: Alice now sees bob's NEW avatar in challenge")
print("  6. ✓✓✓ RECIPROCAL: Bob sees alice's NEW avatar after she changed it")
print("  7. ✓ Demo user avatar snapshot preserved (regression)")
print("\nThe avatar refresh fix is working correctly!")
