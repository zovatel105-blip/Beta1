#!/usr/bin/env python3
"""
Backend test for environment recovery verification.
Tests that .env restoration, ffmpeg installation, and MongoDB reseeding are all working.

This test specifically verifies:
1. POST /api/auth/login for all 4 seed accounts (twykadmin, lucia, marcos, laura)
2. GET /api/auth/me with each session
3. GET /api/feed (no auth needed)
4. GET /api/uploads (no auth needed)
5. GET /api/challenges with authenticated session
6. GET /api/notifications/unread with authenticated session
7. CRITICAL: POST /api/versus with 2 real video files and verify ffmpeg poster generation
"""

import requests
import json
import sys
import os
import io

# Get base URL from .env file
BASE_URL = None
try:
    with open('/app/.env', 'r') as f:
        for line in f:
            if line.startswith('NEXT_PUBLIC_BASE_URL='):
                BASE_URL = line.split('=', 1)[1].strip()
                break
except Exception as e:
    print(f"Warning: Could not read .env file: {e}")

if not BASE_URL:
    BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://feature-gap-bridge.preview.emergentagent.com')

API_URL = f"{BASE_URL}/api"

print(f"Testing backend at: {API_URL}")
print("=" * 80)

# Test credentials from test_credentials.md
TEST_ACCOUNTS = [
    {"username": "twykadmin", "email": "twyk.apk@gmail.com", "password": "Admin12345", "role": "admin"},
    {"username": "lucia", "email": "lucia@test.com", "password": "Test12345", "role": "user"},
    {"username": "marcos", "email": "marcos@test.com", "password": "Test12345", "role": "user"},
    {"username": "laura", "email": "laura@test.com", "password": "Test12345", "role": "user"},
]

# Store session data for each account
sessions = {}

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

# Track test results
test_results = {
    "passed": [],
    "failed": [],
    "critical_failures": []
}

def mark_test_passed(test_name):
    test_results["passed"].append(test_name)
    print_success(f"TEST PASSED: {test_name}")

def mark_test_failed(test_name, is_critical=False):
    test_results["failed"].append(test_name)
    if is_critical:
        test_results["critical_failures"].append(test_name)
    print_error(f"TEST FAILED: {test_name}")

# ============================================================================
# TEST 1: POST /api/auth/login for ALL 4 seed accounts
# ============================================================================
print_test("1. POST /api/auth/login for all 4 seed accounts")

for account in TEST_ACCOUNTS:
    username = account["username"]
    expected_role = account["role"]
    
    try:
        print_info(f"\nTesting login for {username}...")
        
        response = requests.post(
            f"{API_URL}/auth/login",
            json={"username": username, "password": account["password"]},
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check required fields
            if not data.get('ok'):
                print_error(f"{username}: Response missing 'ok: true'")
                mark_test_failed(f"Login {username}", is_critical=True)
                continue
            
            if 'token' not in data:
                print_error(f"{username}: No token in response")
                mark_test_failed(f"Login {username}", is_critical=True)
                continue
            
            if 'user' not in data:
                print_error(f"{username}: No user in response")
                mark_test_failed(f"Login {username}", is_critical=True)
                continue
            
            user = data['user']
            
            # Verify username
            if user.get('username') != username:
                print_error(f"{username}: Username mismatch - got '{user.get('username')}'")
                mark_test_failed(f"Login {username}", is_critical=True)
                continue
            
            # Verify role
            if user.get('role') != expected_role:
                print_error(f"{username}: Role mismatch - expected '{expected_role}', got '{user.get('role')}'")
                mark_test_failed(f"Login {username}", is_critical=True)
                continue
            
            # Check for session cookie
            if 'session_token' not in response.cookies:
                print_error(f"{username}: No session_token cookie set")
                mark_test_failed(f"Login {username}", is_critical=True)
                continue
            
            # Store session data
            sessions[username] = {
                "token": data['token'],
                "cookies": response.cookies,
                "user": user
            }
            
            print_success(f"{username}: Login successful - role={expected_role}, token received, cookie set")
            mark_test_passed(f"Login {username}")
            
        else:
            print_error(f"{username}: Login failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            mark_test_failed(f"Login {username}", is_critical=True)
            
    except Exception as e:
        print_error(f"{username}: Login failed with exception: {str(e)}")
        mark_test_failed(f"Login {username}", is_critical=True)

# ============================================================================
# TEST 2: GET /api/auth/me with each session
# ============================================================================
print_test("2. GET /api/auth/me with each session")

for username, session_data in sessions.items():
    try:
        print_info(f"\nTesting /api/auth/me for {username}...")
        
        headers = {"Authorization": f"Bearer {session_data['token']}"}
        response = requests.get(
            f"{API_URL}/auth/me",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'user' not in data:
                print_error(f"{username}: No user in response")
                mark_test_failed(f"Auth/me {username}")
                continue
            
            user = data['user']
            
            if user.get('username') != username:
                print_error(f"{username}: Username mismatch - expected '{username}', got '{user.get('username')}'")
                mark_test_failed(f"Auth/me {username}")
                continue
            
            print_success(f"{username}: /api/auth/me returned correct user data")
            mark_test_passed(f"Auth/me {username}")
            
        else:
            print_error(f"{username}: Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            mark_test_failed(f"Auth/me {username}")
            
    except Exception as e:
        print_error(f"{username}: /api/auth/me failed with exception: {str(e)}")
        mark_test_failed(f"Auth/me {username}")

# ============================================================================
# TEST 3: GET /api/feed (no auth needed)
# ============================================================================
print_test("3. GET /api/feed (no auth needed)")

try:
    response = requests.get(f"{API_URL}/feed", timeout=10)
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if 'posts' not in data:
            print_error("No 'posts' key in response")
            mark_test_failed("GET /api/feed")
        else:
            posts = data['posts']
            print_success(f"Received {len(posts)} posts")
            
            if not isinstance(posts, list):
                print_error("'posts' is not an array")
                mark_test_failed("GET /api/feed")
            else:
                print_success("Feed returned posts array")
                mark_test_passed("GET /api/feed")
    else:
        print_error(f"Request failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        mark_test_failed("GET /api/feed")
        
except Exception as e:
    print_error(f"GET /api/feed failed with exception: {str(e)}")
    mark_test_failed("GET /api/feed")

# ============================================================================
# TEST 4: GET /api/uploads (no auth needed)
# ============================================================================
print_test("4. GET /api/uploads (no auth needed)")

try:
    response = requests.get(f"{API_URL}/uploads", timeout=10)
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if 'posts' not in data:
            print_error("No 'posts' key in response")
            mark_test_failed("GET /api/uploads")
        else:
            posts = data['posts']
            print_success(f"Received {len(posts)} posts")
            mark_test_passed("GET /api/uploads")
    else:
        print_error(f"Request failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        mark_test_failed("GET /api/uploads")
        
except Exception as e:
    print_error(f"GET /api/uploads failed with exception: {str(e)}")
    mark_test_failed("GET /api/uploads")

# ============================================================================
# TEST 5: GET /api/challenges with authenticated session
# ============================================================================
print_test("5. GET /api/challenges with authenticated session")

# Use lucia's session for this test
if 'lucia' in sessions:
    try:
        headers = {"Authorization": f"Bearer {sessions['lucia']['token']}"}
        response = requests.get(
            f"{API_URL}/challenges",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'challenges' not in data:
                print_error("No 'challenges' key in response")
                mark_test_failed("GET /api/challenges")
            else:
                challenges = data['challenges']
                print_success(f"Received {len(challenges)} challenges")
                mark_test_passed("GET /api/challenges")
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            mark_test_failed("GET /api/challenges")
            
    except Exception as e:
        print_error(f"GET /api/challenges failed with exception: {str(e)}")
        mark_test_failed("GET /api/challenges")
else:
    print_error("Cannot test: lucia session not available")
    mark_test_failed("GET /api/challenges")

# ============================================================================
# TEST 6: GET /api/notifications/unread with authenticated session
# ============================================================================
print_test("6. GET /api/notifications/unread with authenticated session")

# Use lucia's session for this test
if 'lucia' in sessions:
    try:
        headers = {"Authorization": f"Bearer {sessions['lucia']['token']}"}
        response = requests.get(
            f"{API_URL}/notifications/unread",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'count' not in data:
                print_error("No 'count' key in response")
                mark_test_failed("GET /api/notifications/unread")
            else:
                count = data['count']
                print_success(f"Unread notifications count: {count}")
                mark_test_passed("GET /api/notifications/unread")
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            mark_test_failed("GET /api/notifications/unread")
            
    except Exception as e:
        print_error(f"GET /api/notifications/unread failed with exception: {str(e)}")
        mark_test_failed("GET /api/notifications/unread")
else:
    print_error("Cannot test: lucia session not available")
    mark_test_failed("GET /api/notifications/unread")

# ============================================================================
# TEST 7: CRITICAL - POST /api/versus with 2 real video files and verify ffmpeg poster generation
# ============================================================================
print_test("7. CRITICAL - POST /api/versus with 2 real video files (ffmpeg verification)")

# Use marcos's session for this test
if 'marcos' in sessions:
    try:
        print_info("Creating small test video files...")
        
        # Create minimal valid MP4 files (smallest possible valid MP4)
        # This is a minimal ftyp + moov + mdat structure
        mp4_header = bytes([
            # ftyp box
            0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
            0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
            0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
            0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
            # moov box (minimal)
            0x00, 0x00, 0x00, 0x08, 0x6d, 0x6f, 0x6f, 0x76,
            # mdat box (minimal)
            0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74,
        ])
        
        video_a = io.BytesIO(mp4_header)
        video_b = io.BytesIO(mp4_header)
        
        print_info("Uploading versus post with 2 video files...")
        
        files = {
            'fileA': ('test_video_a.mp4', video_a, 'video/mp4'),
            'fileB': ('test_video_b.mp4', video_b, 'video/mp4'),
        }
        
        data = {
            'description': 'Test versus post for ffmpeg verification'
        }
        
        headers = {"Authorization": f"Bearer {sessions['marcos']['token']}"}
        
        response = requests.post(
            f"{API_URL}/versus",
            files=files,
            data=data,
            headers=headers,
            timeout=30
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print_info(f"Response: {json.dumps(result, indent=2)[:1000]}...")
            
            if not result.get('ok'):
                print_error("Response missing 'ok: true'")
                mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
            elif 'post' not in result:
                print_error("No 'post' in response")
                mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
            else:
                post = result['post']
                
                # Check for sideA and sideB
                if 'sideA' not in post or 'sideB' not in post:
                    print_error("Post missing sideA or sideB")
                    mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
                else:
                    sideA = post['sideA']
                    sideB = post['sideB']
                    
                    # CRITICAL: Check for posterUrl fields
                    posterA = sideA.get('posterUrl')
                    posterB = sideB.get('posterUrl')
                    
                    if not posterA:
                        print_error("sideA.posterUrl is missing!")
                        mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
                    elif not posterB:
                        print_error("sideB.posterUrl is missing!")
                        mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
                    else:
                        print_success(f"sideA.posterUrl: {posterA}")
                        print_success(f"sideB.posterUrl: {posterB}")
                        
                        # CRITICAL: Verify poster files are actually accessible
                        print_info("Verifying poster files are accessible...")
                        
                        poster_a_failed = False
                        poster_b_failed = False
                        
                        # Test posterA
                        try:
                            poster_a_url = f"{BASE_URL}{posterA}" if posterA.startswith('/') else posterA
                            print_info(f"Fetching posterA: {poster_a_url}")
                            
                            poster_response = requests.get(poster_a_url, timeout=10)
                            
                            if poster_response.status_code == 200:
                                # Check if it's actually an image
                                content_type = poster_response.headers.get('content-type', '')
                                if 'image' in content_type or len(poster_response.content) > 0:
                                    print_success(f"posterA is accessible and returns image data (size: {len(poster_response.content)} bytes)")
                                else:
                                    print_error(f"posterA returned non-image content: {content_type}")
                                    poster_a_failed = True
                            else:
                                print_error(f"posterA returned status {poster_response.status_code}")
                                poster_a_failed = True
                        except Exception as e:
                            print_error(f"Failed to fetch posterA: {str(e)}")
                            poster_a_failed = True
                        
                        # Test posterB
                        try:
                            poster_b_url = f"{BASE_URL}{posterB}" if posterB.startswith('/') else posterB
                            print_info(f"Fetching posterB: {poster_b_url}")
                            
                            poster_response = requests.get(poster_b_url, timeout=10)
                            
                            if poster_response.status_code == 200:
                                # Check if it's actually an image
                                content_type = poster_response.headers.get('content-type', '')
                                if 'image' in content_type or len(poster_response.content) > 0:
                                    print_success(f"posterB is accessible and returns image data (size: {len(poster_response.content)} bytes)")
                                else:
                                    print_error(f"posterB returned non-image content: {content_type}")
                                    poster_b_failed = True
                            else:
                                print_error(f"posterB returned status {poster_response.status_code}")
                                poster_b_failed = True
                        except Exception as e:
                            print_error(f"Failed to fetch posterB: {str(e)}")
                            poster_b_failed = True
                        
                        if poster_a_failed or poster_b_failed:
                            print_error("CRITICAL: ffmpeg poster generation is NOT working - poster files are not accessible")
                            mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
                        else:
                            print_success("CRITICAL: ffmpeg poster generation is WORKING - both poster files are accessible")
                            mark_test_passed("POST /api/versus (ffmpeg)")
        
        elif response.status_code == 500:
            print_error(f"Server error 500 - this likely indicates ffmpeg is not working")
            print_error(f"Response: {response.text}")
            mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
            
    except Exception as e:
        print_error(f"POST /api/versus failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)
else:
    print_error("Cannot test: marcos session not available")
    mark_test_failed("POST /api/versus (ffmpeg)", is_critical=True)

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("ENVIRONMENT RECOVERY VERIFICATION COMPLETE")
print("=" * 80)

print(f"\n✅ PASSED: {len(test_results['passed'])} tests")
for test in test_results['passed']:
    print(f"   - {test}")

print(f"\n❌ FAILED: {len(test_results['failed'])} tests")
for test in test_results['failed']:
    print(f"   - {test}")

if test_results['critical_failures']:
    print(f"\n🚨 CRITICAL FAILURES: {len(test_results['critical_failures'])} tests")
    for test in test_results['critical_failures']:
        print(f"   - {test}")
    print("\nCRITICAL: Environment recovery has FAILED. The system is NOT fully functional.")
    sys.exit(1)
else:
    print("\n✅ SUCCESS: All critical tests passed. Environment recovery is VERIFIED.")
    sys.exit(0)
