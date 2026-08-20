#!/usr/bin/env python3
"""
Backend test for role field verification after Kotlin native code changes.
This test verifies that the backend API contract for the 'role' field is working correctly.

Test scenarios:
1. POST /api/auth/login with twykadmin -> should return role: "admin"
2. POST /api/auth/login with lucia -> should return role: "user"
3. GET /api/auth/me with lucia's session -> should return role: "user"
4. Regression tests: GET /api/feed, GET /api/uploads, GET /api/challenges
"""

import requests
import json
import sys
import os

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://admin-content-launch.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

print(f"Testing backend role field at: {API_URL}")
print("=" * 80)

# Test credentials from test_credentials.md
ADMIN_CREDS = {"username": "twykadmin", "password": "Admin12345"}
LUCIA_CREDS = {"username": "lucia", "password": "Test12345"}

# Store tokens
lucia_token = None
lucia_cookies = None

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
    "passed": 0,
    "failed": 0,
    "total": 0
}

# ============================================================================
# TEST 1: POST /api/auth/login with twykadmin -> should return role: "admin"
# ============================================================================
try:
    test_results["total"] += 1
    print_test("1. POST /api/auth/login with twykadmin -> verify role='admin'")
    
    response = requests.post(
        f"{API_URL}/auth/login",
        json=ADMIN_CREDS,
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Check required fields
        if data.get('ok') != True:
            print_error("Response missing 'ok: true'")
            test_results["failed"] += 1
        elif 'user' not in data:
            print_error("No 'user' object in response")
            test_results["failed"] += 1
        else:
            user = data['user']
            print_info(f"User object keys: {list(user.keys())}")
            
            # CRITICAL CHECK: role field must be present and equal to 'admin'
            if 'role' not in user:
                print_error("❌ CRITICAL: 'role' field is MISSING from user object")
                print_error(f"User object: {json.dumps(user, indent=2)}")
                test_results["failed"] += 1
            elif user['role'] != 'admin':
                print_error(f"❌ CRITICAL: role is '{user['role']}', expected 'admin'")
                test_results["failed"] += 1
            else:
                print_success(f"✅ VERIFIED: user.role = 'admin' (correct)")
                print_success(f"Username: {user.get('username')}")
                print_success("TEST 1 PASSED")
                test_results["passed"] += 1
    else:
        print_error(f"Login failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        test_results["failed"] += 1
        
except Exception as e:
    print_error(f"TEST 1 FAILED with exception: {str(e)}")
    test_results["failed"] += 1

# ============================================================================
# TEST 2: POST /api/auth/login with lucia -> should return role: "user"
# ============================================================================
try:
    test_results["total"] += 1
    print_test("2. POST /api/auth/login with lucia -> verify role='user'")
    
    response = requests.post(
        f"{API_URL}/auth/login",
        json=LUCIA_CREDS,
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print_info(f"Response keys: {list(data.keys())}")
        
        # Store token for next test
        if 'token' in data:
            lucia_token = data['token']
            print_info(f"Token received: {lucia_token[:20]}...")
        
        if 'session_token' in response.cookies:
            lucia_cookies = response.cookies
            print_info("Session cookie received")
        
        # Check required fields
        if data.get('ok') != True:
            print_error("Response missing 'ok: true'")
            test_results["failed"] += 1
        elif 'user' not in data:
            print_error("No 'user' object in response")
            test_results["failed"] += 1
        else:
            user = data['user']
            print_info(f"User object keys: {list(user.keys())}")
            
            # CRITICAL CHECK: role field must be present and equal to 'user'
            if 'role' not in user:
                print_error("❌ CRITICAL: 'role' field is MISSING from user object")
                print_error(f"User object: {json.dumps(user, indent=2)}")
                test_results["failed"] += 1
            elif user['role'] != 'user':
                print_error(f"❌ CRITICAL: role is '{user['role']}', expected 'user'")
                test_results["failed"] += 1
            else:
                print_success(f"✅ VERIFIED: user.role = 'user' (correct)")
                print_success(f"Username: {user.get('username')}")
                print_success("TEST 2 PASSED")
                test_results["passed"] += 1
    else:
        print_error(f"Login failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        test_results["failed"] += 1
        
except Exception as e:
    print_error(f"TEST 2 FAILED with exception: {str(e)}")
    test_results["failed"] += 1

# ============================================================================
# TEST 3: GET /api/auth/me with lucia's token -> should return role: "user"
# ============================================================================
try:
    test_results["total"] += 1
    print_test("3. GET /api/auth/me with lucia's session -> verify role='user'")
    
    if not lucia_token:
        print_error("Cannot test: lucia_token not available from previous test")
        test_results["failed"] += 1
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
            print_info(f"Response keys: {list(data.keys())}")
            
            if 'user' not in data:
                print_error("No 'user' object in response")
                test_results["failed"] += 1
            else:
                user = data['user']
                print_info(f"User object keys: {list(user.keys())}")
                
                # CRITICAL CHECK: role field must be present and equal to 'user'
                if 'role' not in user:
                    print_error("❌ CRITICAL: 'role' field is MISSING from user object")
                    print_error(f"User object: {json.dumps(user, indent=2)}")
                    test_results["failed"] += 1
                elif user['role'] != 'user':
                    print_error(f"❌ CRITICAL: role is '{user['role']}', expected 'user'")
                    test_results["failed"] += 1
                else:
                    print_success(f"✅ VERIFIED: user.role = 'user' (correct)")
                    print_success(f"Username: {user.get('username')}")
                    print_success("TEST 3 PASSED")
                    test_results["passed"] += 1
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            test_results["failed"] += 1
            
except Exception as e:
    print_error(f"TEST 3 FAILED with exception: {str(e)}")
    test_results["failed"] += 1

# ============================================================================
# TEST 4: REGRESSION - GET /api/feed?cursor=0&limit=8
# ============================================================================
try:
    test_results["total"] += 1
    print_test("4. REGRESSION - GET /api/feed?cursor=0&limit=8")
    
    response = requests.get(
        f"{API_URL}/feed?cursor=0&limit=8",
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if 'posts' in data:
            posts = data['posts']
            print_success(f"✅ Feed endpoint working - received {len(posts)} posts")
            print_success("TEST 4 PASSED")
            test_results["passed"] += 1
        else:
            print_error("No 'posts' key in response")
            test_results["failed"] += 1
    else:
        print_error(f"Request failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        test_results["failed"] += 1
        
except Exception as e:
    print_error(f"TEST 4 FAILED with exception: {str(e)}")
    test_results["failed"] += 1

# ============================================================================
# TEST 5: REGRESSION - GET /api/uploads
# ============================================================================
try:
    test_results["total"] += 1
    print_test("5. REGRESSION - GET /api/uploads")
    
    response = requests.get(
        f"{API_URL}/uploads",
        timeout=10
    )
    
    print_info(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        
        if 'posts' in data:
            posts = data['posts']
            print_success(f"✅ Uploads endpoint working - received {len(posts)} posts")
            print_success("TEST 5 PASSED")
            test_results["passed"] += 1
        else:
            print_error("No 'posts' key in response")
            test_results["failed"] += 1
    else:
        print_error(f"Request failed with status {response.status_code}")
        print_error(f"Response: {response.text}")
        test_results["failed"] += 1
        
except Exception as e:
    print_error(f"TEST 5 FAILED with exception: {str(e)}")
    test_results["failed"] += 1

# ============================================================================
# TEST 6: REGRESSION - GET /api/challenges (authenticated)
# ============================================================================
try:
    test_results["total"] += 1
    print_test("6. REGRESSION - GET /api/challenges (authenticated with lucia)")
    
    if not lucia_token:
        print_error("Cannot test: lucia_token not available")
        test_results["failed"] += 1
    else:
        headers = {"Authorization": f"Bearer {lucia_token}"}
        response = requests.get(
            f"{API_URL}/challenges",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'challenges' in data:
                challenges = data['challenges']
                print_success(f"✅ Challenges endpoint working - received {len(challenges)} challenges")
                print_success("TEST 6 PASSED")
                test_results["passed"] += 1
            else:
                print_error("No 'challenges' key in response")
                test_results["failed"] += 1
        else:
            print_error(f"Request failed with status {response.status_code}")
            print_error(f"Response: {response.text}")
            test_results["failed"] += 1
            
except Exception as e:
    print_error(f"TEST 6 FAILED with exception: {str(e)}")
    test_results["failed"] += 1

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("ROLE FIELD VERIFICATION TEST COMPLETE")
print("=" * 80)
print(f"\nTotal tests: {test_results['total']}")
print(f"✅ Passed: {test_results['passed']}")
print(f"❌ Failed: {test_results['failed']}")

if test_results['failed'] == 0:
    print("\n🎉 ALL TESTS PASSED - Role field API contract is working correctly!")
    print("\nKey findings:")
    print("✅ POST /api/auth/login (twykadmin) returns role='admin'")
    print("✅ POST /api/auth/login (lucia) returns role='user'")
    print("✅ GET /api/auth/me returns role='user' for lucia")
    print("✅ GET /api/feed endpoint working (regression)")
    print("✅ GET /api/uploads endpoint working (regression)")
    print("✅ GET /api/challenges endpoint working (regression)")
    sys.exit(0)
else:
    print("\n⚠️  SOME TESTS FAILED - Review the results above")
    sys.exit(1)
