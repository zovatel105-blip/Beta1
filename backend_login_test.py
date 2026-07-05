#!/usr/bin/env python3
"""
Backend test for LOGIN BUG FIX: Login by EMAIL or USERNAME
Tests the fix in lib/db.js (getUserByUsernameOrEmail + verifyUserCredentials)

Existing admin account:
- username='twykadmin'
- email='twyk.apk@gmail.com'
- password='Admin12345'

Test scenarios:
1) Login by EMAIL (lowercase) -> 200 with admin role
2) Login by EMAIL (uppercase/mixed case) -> 200 (case-insensitive)
3) Login by USERNAME -> 200 (regression check)
4) Wrong password -> 401 invalid_credentials
5) Register new user and verify login by both username and email
6) GET /api/auth/me with returned cookie/token -> 200 with user object
"""

import requests
import json
import sys
import os

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://env-checker-7.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

print(f"Testing against: {API_BASE}")
print("=" * 80)

# Track test results
passed = 0
failed = 0
test_results = []

def test_scenario(name, func):
    """Run a test scenario and track results"""
    global passed, failed
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)
    try:
        func()
        passed += 1
        test_results.append(f"✅ {name}")
        print(f"✅ PASSED: {name}")
        return True
    except AssertionError as e:
        failed += 1
        test_results.append(f"❌ {name}: {str(e)}")
        print(f"❌ FAILED: {name}")
        print(f"   Error: {str(e)}")
        return False
    except Exception as e:
        failed += 1
        test_results.append(f"❌ {name}: Unexpected error - {str(e)}")
        print(f"❌ FAILED: {name}")
        print(f"   Unexpected error: {str(e)}")
        return False

def scenario_1_login_by_email_lowercase():
    """Scenario 1: Login by EMAIL (lowercase) -> 200 with admin role and token"""
    print("\n📧 Testing login with email (lowercase): twyk.apk@gmail.com")
    
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": "twyk.apk@gmail.com",
            "password": "Admin12345"
        },
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert data.get('ok') == True, "Expected ok=true"
    assert 'user' in data, "Expected 'user' in response"
    assert 'token' in data, "Expected 'token' in response"
    
    user = data['user']
    assert user.get('role') == 'admin', f"Expected role='admin', got {user.get('role')}"
    assert user.get('email') == 'twyk.apk@gmail.com', f"Expected email='twyk.apk@gmail.com', got {user.get('email')}"
    
    # Check cookie
    cookies = response.cookies
    assert 'session_token' in cookies, "Expected session_token cookie"
    
    print(f"✓ Login successful with email")
    print(f"✓ User role: {user.get('role')}")
    print(f"✓ Token present: {data.get('token')[:20]}...")
    print(f"✓ Cookie present: session_token")
    
    return data

def scenario_2_login_by_email_uppercase():
    """Scenario 2: Login by EMAIL (uppercase/mixed) -> 200 (case-insensitive)"""
    print("\n📧 Testing login with email (uppercase): TWYK.APK@Gmail.com")
    
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": "TWYK.APK@Gmail.com",
            "password": "Admin12345"
        },
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert data.get('ok') == True, "Expected ok=true"
    assert 'user' in data, "Expected 'user' in response"
    
    user = data['user']
    assert user.get('role') == 'admin', f"Expected role='admin', got {user.get('role')}"
    
    print(f"✓ Login successful with uppercase email (case-insensitive match)")
    print(f"✓ User role: {user.get('role')}")
    
    return data

def scenario_3_login_by_username():
    """Scenario 3: Login by USERNAME -> 200 (regression check)"""
    print("\n👤 Testing login with username: twykadmin")
    
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": "twykadmin",
            "password": "Admin12345"
        },
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert data.get('ok') == True, "Expected ok=true"
    assert 'user' in data, "Expected 'user' in response"
    
    user = data['user']
    assert user.get('username') == 'twykadmin', f"Expected username='twykadmin', got {user.get('username')}"
    assert user.get('role') == 'admin', f"Expected role='admin', got {user.get('role')}"
    
    print(f"✓ Login successful with username (regression check passed)")
    print(f"✓ Username: {user.get('username')}")
    print(f"✓ User role: {user.get('role')}")
    
    return data

def scenario_4_wrong_password():
    """Scenario 4: Wrong password -> 401 invalid_credentials"""
    print("\n🔒 Testing login with wrong password")
    
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": "twyk.apk@gmail.com",
            "password": "wrongpass"
        },
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    data = response.json()
    assert data.get('error') == 'invalid_credentials', f"Expected error='invalid_credentials', got {data.get('error')}"
    
    print(f"✓ Correctly rejected with 401")
    print(f"✓ Error: {data.get('error')}")

def scenario_5_register_and_login_both_ways():
    """Scenario 5: Register new user and verify login by both username and email"""
    import random
    import string
    
    # Generate unique credentials
    rand_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    test_username = f"testuser_{rand_suffix}"
    test_email = f"test_{rand_suffix}@example.com"
    test_password = "TestPass123"
    
    print(f"\n👥 Testing registration and dual login")
    print(f"   Username: {test_username}")
    print(f"   Email: {test_email}")
    
    # Step 1: Register
    print("\n   Step 1: Registering new user...")
    reg_response = requests.post(
        f"{API_BASE}/auth/register",
        json={
            "username": test_username,
            "email": test_email,
            "password": test_password,
            "birthDate": "1995-05-05"
        },
        headers={"Content-Type": "application/json"}
    )
    
    print(f"   Registration status: {reg_response.status_code}")
    print(f"   Registration response: {reg_response.text[:300]}")
    
    assert reg_response.status_code == 200, f"Registration failed: {reg_response.status_code}"
    
    reg_data = reg_response.json()
    assert reg_data.get('ok') == True, "Expected ok=true in registration"
    assert 'user' in reg_data, "Expected 'user' in registration response"
    
    print(f"   ✓ User registered successfully")
    
    # Step 2: Login by USERNAME
    print("\n   Step 2: Login by USERNAME...")
    login_username_response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": test_username,
            "password": test_password
        },
        headers={"Content-Type": "application/json"}
    )
    
    print(f"   Login by username status: {login_username_response.status_code}")
    print(f"   Login by username response: {login_username_response.text[:300]}")
    
    assert login_username_response.status_code == 200, f"Login by username failed: {login_username_response.status_code}"
    
    login_username_data = login_username_response.json()
    assert login_username_data.get('ok') == True, "Expected ok=true"
    assert login_username_data['user']['username'] == test_username, "Username mismatch"
    
    print(f"   ✓ Login by USERNAME successful")
    
    # Step 3: Login by EMAIL
    print("\n   Step 3: Login by EMAIL...")
    login_email_response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": test_email,  # Using email in username field
            "password": test_password
        },
        headers={"Content-Type": "application/json"}
    )
    
    print(f"   Login by email status: {login_email_response.status_code}")
    print(f"   Login by email response: {login_email_response.text[:300]}")
    
    assert login_email_response.status_code == 200, f"Login by email failed: {login_email_response.status_code}"
    
    login_email_data = login_email_response.json()
    assert login_email_data.get('ok') == True, "Expected ok=true"
    assert login_email_data['user']['username'] == test_username, "Username mismatch when logging in by email"
    assert login_email_data['user']['email'] == test_email, "Email mismatch"
    
    print(f"   ✓ Login by EMAIL successful")
    print(f"   ✓ Both login methods work for new user")
    
    return login_email_data

def scenario_6_auth_me_with_token():
    """Scenario 6: GET /api/auth/me with returned cookie/token -> 200 with user object"""
    print("\n🔐 Testing GET /api/auth/me with authentication")
    
    # First login to get token and cookie
    print("   Step 1: Login to get credentials...")
    login_response = requests.post(
        f"{API_BASE}/auth/login",
        json={
            "username": "twyk.apk@gmail.com",
            "password": "Admin12345"
        },
        headers={"Content-Type": "application/json"}
    )
    
    assert login_response.status_code == 200, "Login failed"
    login_data = login_response.json()
    token = login_data.get('token')
    cookies = login_response.cookies
    
    print(f"   ✓ Login successful, got token and cookie")
    
    # Test with Bearer token
    print("\n   Step 2: Testing /api/auth/me with Bearer token...")
    me_response_token = requests.get(
        f"{API_BASE}/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    print(f"   Status: {me_response_token.status_code}")
    print(f"   Response: {me_response_token.text[:300]}")
    
    assert me_response_token.status_code == 200, f"Expected 200, got {me_response_token.status_code}"
    
    me_data = me_response_token.json()
    assert 'user' in me_data, "Expected 'user' in response"
    assert me_data['user']['username'] == 'twykadmin', "Username mismatch"
    assert me_data['user']['role'] == 'admin', "Role mismatch"
    
    print(f"   ✓ /api/auth/me with Bearer token successful")
    print(f"   ✓ User: {me_data['user']['username']}")
    print(f"   ✓ Role: {me_data['user']['role']}")
    
    # Test with cookie
    print("\n   Step 3: Testing /api/auth/me with cookie...")
    me_response_cookie = requests.get(
        f"{API_BASE}/auth/me",
        cookies=cookies
    )
    
    print(f"   Status: {me_response_cookie.status_code}")
    print(f"   Response: {me_response_cookie.text[:300]}")
    
    assert me_response_cookie.status_code == 200, f"Expected 200, got {me_response_cookie.status_code}"
    
    me_data_cookie = me_response_cookie.json()
    assert 'user' in me_data_cookie, "Expected 'user' in response"
    assert me_data_cookie['user']['username'] == 'twykadmin', "Username mismatch"
    
    print(f"   ✓ /api/auth/me with cookie successful")
    print(f"   ✓ Both authentication methods work")

# Run all test scenarios
print("\n" + "="*80)
print("STARTING LOGIN BUG FIX TESTS")
print("="*80)

test_scenario("Scenario 1: Login by EMAIL (lowercase)", scenario_1_login_by_email_lowercase)
test_scenario("Scenario 2: Login by EMAIL (uppercase/mixed case)", scenario_2_login_by_email_uppercase)
test_scenario("Scenario 3: Login by USERNAME (regression)", scenario_3_login_by_username)
test_scenario("Scenario 4: Wrong password rejection", scenario_4_wrong_password)
test_scenario("Scenario 5: Register new user and login both ways", scenario_5_register_and_login_both_ways)
test_scenario("Scenario 6: GET /api/auth/me with token/cookie", scenario_6_auth_me_with_token)

# Print summary
print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)
for result in test_results:
    print(result)

print("\n" + "="*80)
print(f"TOTAL: {passed + failed} tests")
print(f"✅ PASSED: {passed}")
print(f"❌ FAILED: {failed}")
print("="*80)

if failed > 0:
    print("\n⚠️  Some tests failed. The login bug fix needs attention.")
    sys.exit(1)
else:
    print("\n🎉 All tests passed! The login bug fix is working correctly.")
    sys.exit(0)
