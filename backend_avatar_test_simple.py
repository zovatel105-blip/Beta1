#!/usr/bin/env python3
"""
Backend Avatar Refresh Test for TWYK App - Simplified with Bearer tokens
Tests that challenge participants' avatars are refreshed after profile photo changes
"""

import requests
import json
import sys
import io
import time

BASE_URL = "http://localhost:3000/api"
print(f"Using BASE_URL: {BASE_URL}")

def create_dummy_mp4():
    return b'\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6f\x6d\x00\x00\x02\x00' + b'\x00' * 100

def create_dummy_image():
    return b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'

def print_section(title):
    print("\n" + "="*80)
    print(title)
    print("="*80)

# Register alice
print_section("SCENARIO A: Register alice and bob")
print("\n[A1] Registering alice...")
ts = str(int(time.time()))
response = requests.post(f"{BASE_URL}/auth/register", json={
    "username": f"alice_{ts}",
    "email": f"alice_{ts}@test.com",
    "password": "alice123"
})
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text}")
    sys.exit(1)

alice_result = response.json()
alice_token = alice_result['token']
alice_id = alice_result['user']['id']
alice_username = alice_result['user']['username']
print(f"✓ Alice registered: {alice_username}, ID: {alice_id}")

# Register bob
print("\n[A2] Registering bob...")
response = requests.post(f"{BASE_URL}/auth/register", json={
    "username": f"bob_{ts}",
    "email": f"bob_{ts}@test.com",
    "password": "bob123"
})
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text}")
    sys.exit(1)

bob_result = response.json()
bob_token = bob_result['token']
bob_id = bob_result['user']['id']
bob_username = bob_result['user']['username']
print(f"✓ Bob registered: {bob_username}, ID: {bob_id}")

# Bob creates challenge to alice
print_section("SCENARIO B: Bob creates challenge to alice")
print("\n[B1] Bob creating challenge...")
files = {'file': ('video.mp4', io.BytesIO(create_dummy_mp4()), 'video/mp4')}
data = {
    'targetAuthor': json.dumps({
        'id': alice_id,
        'username': alice_username,
        'name': 'Alice',
        'avatarUrl': 'https://i.pravatar.cc/120?img=1'
    }),
    'message': 'reto'
}
headers = {'Authorization': f'Bearer {bob_token}'}
response = requests.post(f"{BASE_URL}/challenges", files=files, data=data, headers=headers)
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text[:500]}")
    sys.exit(1)

challenge = response.json()['challenge']
challenge_id = challenge['id']
bob_initial_avatar = challenge['from']['avatarUrl']
print(f"✓ Challenge created: {challenge_id}")
print(f"  - From: {challenge['from']['username']}, avatar: {bob_initial_avatar}")
print(f"  - To: {challenge['to']['username']}")

# Alice gets challenges
print_section("SCENARIO C: Alice gets challenges (bob's current avatar)")
print("\n[C1] Alice fetching challenges...")
headers = {'Authorization': f'Bearer {alice_token}'}
response = requests.get(f"{BASE_URL}/challenges", headers=headers)
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text}")
    sys.exit(1)

challenges = response.json()['challenges']
if len(challenges) == 0:
    print(f"✗ No challenges found!")
    sys.exit(1)

from_avatar_step_c = challenges[0]['from']['avatarUrl']
print(f"✓ Alice sees {len(challenges)} challenge(s)")
print(f"  - Bob's avatar (step C): {from_avatar_step_c}")

# Bob changes his profile photo
print_section("SCENARIO D: Bob changes his profile photo")
print("\n[D1] Bob updating profile...")
files = {'avatar': ('avatar.png', io.BytesIO(create_dummy_image()), 'image/png')}
headers = {'Authorization': f'Bearer {bob_token}'}
response = requests.post(f"{BASE_URL}/profile", files=files, headers=headers)
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text}")
    sys.exit(1)

bob_new_avatar = response.json()['user']['avatarUrl']
print(f"✓ Bob's profile updated")
print(f"  - New avatar: {bob_new_avatar}")
if not bob_new_avatar.startswith('/uploads/avatar_'):
    print(f"✗ Avatar URL format incorrect!")
    sys.exit(1)

# CORE FIX: Alice gets challenges again
print_section("SCENARIO E: CORE FIX - Alice gets challenges (bob's NEW avatar)")
print("\n[E1] Alice fetching challenges again...")
headers = {'Authorization': f'Bearer {alice_token}'}
response = requests.get(f"{BASE_URL}/challenges", headers=headers)
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text}")
    sys.exit(1)

challenges = response.json()['challenges']
from_avatar_step_e = challenges[0]['from']['avatarUrl']
print(f"✓ Alice fetched challenges")
print(f"  - Bob's avatar (step E): {from_avatar_step_e}")

print(f"\n[CORE FIX VERIFICATION]")
print(f"  - Bob's initial avatar (step C): {from_avatar_step_c}")
print(f"  - Bob's new avatar (step D): {bob_new_avatar}")
print(f"  - Bob's avatar in challenge (step E): {from_avatar_step_e}")

if from_avatar_step_e == bob_new_avatar and from_avatar_step_e.startswith('/uploads/avatar_'):
    print(f"✓✓✓ CORE FIX VERIFIED: Challenge shows bob's NEW avatar!")
else:
    print(f"✗✗✗ CORE FIX FAILED: Challenge shows OLD avatar!")
    print(f"    Expected: {bob_new_avatar}")
    print(f"    Got: {from_avatar_step_e}")
    sys.exit(1)

# Reciprocal test
print_section("SCENARIO F: Reciprocal - Alice changes avatar, bob sees it")
print("\n[F1] Alice updating profile...")
files = {'avatar': ('avatar.png', io.BytesIO(create_dummy_image()), 'image/png')}
headers = {'Authorization': f'Bearer {alice_token}'}
response = requests.post(f"{BASE_URL}/profile", files=files, headers=headers)
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text}")
    sys.exit(1)

alice_new_avatar = response.json()['user']['avatarUrl']
print(f"✓ Alice's profile updated: {alice_new_avatar}")

print("\n[F2] Bob fetching challenges with role=from...")
headers = {'Authorization': f'Bearer {bob_token}'}
response = requests.get(f"{BASE_URL}/challenges?role=from", headers=headers)
print(f"Status: {response.status_code}")
if response.status_code != 200:
    print(f"✗ Failed: {response.text}")
    sys.exit(1)

challenges = response.json()['challenges']
to_avatar = challenges[0]['to']['avatarUrl']
print(f"✓ Bob sees challenges he sent")
print(f"  - Alice's avatar: {to_avatar}")

if to_avatar == alice_new_avatar and to_avatar.startswith('/uploads/avatar_'):
    print(f"✓✓✓ RECIPROCAL FIX VERIFIED: Challenge shows alice's NEW avatar!")
else:
    print(f"✗✗✗ RECIPROCAL FIX FAILED!")
    print(f"    Expected: {alice_new_avatar}")
    print(f"    Got: {to_avatar}")
    sys.exit(1)

# Final summary
print_section("FINAL SUMMARY")
print("\n✓✓✓ ALL CORE TESTS PASSED ✓✓✓")
print("\nKey verifications:")
print("  1. ✓ Two users registered (alice and bob)")
print("  2. ✓ Bob created challenge to alice")
print("  3. ✓ Alice saw challenge with bob's initial avatar")
print("  4. ✓ Bob changed his profile photo")
print("  5. ✓✓✓ CORE FIX: Alice now sees bob's NEW avatar in challenge")
print("  6. ✓✓✓ RECIPROCAL: Bob sees alice's NEW avatar after she changed it")
print("\nThe avatar refresh fix is working correctly!")
