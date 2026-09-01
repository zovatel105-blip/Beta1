#!/usr/bin/env python3
"""
Backend test for bcrypt -> bcryptjs migration verification
Tests that bcryptjs can verify old bcrypt hashes and create new compatible hashes
"""

import requests
import json
import sys
import os

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://config-install.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

print(f"Testing against: {API_BASE}")
print("=" * 80)

# Test credentials from memory/test_credentials.md
EXISTING_USERS = [
    {"username": "twyk", "password": "Admin12345", "role": "admin"},
    {"username": "lucia", "password": "Test12345", "role": "user"},
    {"username": "marcos", "password": "Test12345", "role": "user"},
    {"username": "laura", "password": "Test12345", "role": "user"}
]

def test_login_existing_users():
    """
    TEST 1: Verify that bcryptjs can verify old bcrypt hashes
    These users were created with the original native bcrypt module
    """
    print("\n### TEST 1: Login with EXISTING users (old bcrypt hashes)")
    print("-" * 80)
    
    all_passed = True
    for user in EXISTING_USERS:
        try:
            response = requests.post(
                f"{API_BASE}/auth/login",
                json={"username": user["username"], "password": user["password"]},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("user", {}).get("username") == user["username"]:
                    print(f"✅ {user['username']}: Login successful (bcryptjs verified old hash)")
                    print(f"   Role: {data.get('user', {}).get('role')}")
                else:
                    print(f"❌ {user['username']}: Login returned wrong user data")
                    all_passed = False
            else:
                print(f"❌ {user['username']}: Login failed with status {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                all_passed = False
                
        except Exception as e:
            print(f"❌ {user['username']}: Exception during login - {str(e)}")
            all_passed = False
    
    return all_passed


def test_register_new_user():
    """
    TEST 2: Register a new user and verify the hash is created correctly with bcryptjs
    Then immediately login with that user to verify the hash works
    """
    print("\n### TEST 2: Register NEW user (bcryptjs creates new hash)")
    print("-" * 80)
    
    new_user = {
        "username": f"testuser_bcryptjs_{os.urandom(4).hex()}",
        "email": f"test_{os.urandom(4).hex()}@example.com",
        "password": "TestPassword123",
        "birthDate": "2000-01-15"  # Must be at least 13 years old (camelCase!)
    }
    
    try:
        # Register
        print(f"Registering user: {new_user['username']}")
        response = requests.post(
            f"{API_BASE}/auth/register",
            json=new_user,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            print(f"❌ Registration failed with status {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
        
        data = response.json()
        print(f"✅ Registration successful")
        print(f"   User ID: {data.get('user', {}).get('id')}")
        
        # Immediate login with same password
        print(f"\nAttempting immediate login with same credentials...")
        login_response = requests.post(
            f"{API_BASE}/auth/login",
            json={"username": new_user["username"], "password": new_user["password"]},
            headers={"Content-Type": "application/json"}
        )
        
        if login_response.status_code == 200:
            login_data = login_response.json()
            if login_data.get("user", {}).get("username") == new_user["username"]:
                print(f"✅ Immediate login successful (bcryptjs hash verified)")
                return True
            else:
                print(f"❌ Login returned wrong user data")
                return False
        else:
            print(f"❌ Login failed with status {login_response.status_code}")
            print(f"   Response: {login_response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception during test - {str(e)}")
        return False


def test_auth_me():
    """
    TEST 3: Verify GET /api/auth/me works with a valid session
    """
    print("\n### TEST 3: GET /api/auth/me with valid session")
    print("-" * 80)
    
    try:
        # First login to get a session
        login_response = requests.post(
            f"{API_BASE}/auth/login",
            json={"username": "lucia", "password": "Test12345"},
            headers={"Content-Type": "application/json"}
        )
        
        if login_response.status_code != 200:
            print(f"❌ Login failed, cannot test /auth/me")
            return False
        
        # Extract token from response
        login_data = login_response.json()
        token = login_data.get("token")
        
        if not token:
            print(f"❌ No token in login response")
            return False
        
        # Test /auth/me with token
        me_response = requests.get(
            f"{API_BASE}/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if me_response.status_code == 200:
            me_data = me_response.json()
            if me_data.get("user", {}).get("username") == "lucia":
                print(f"✅ GET /api/auth/me successful")
                print(f"   Username: {me_data.get('user', {}).get('username')}")
                print(f"   Email: {me_data.get('user', {}).get('email')}")
                return True
            else:
                print(f"❌ /auth/me returned wrong user data")
                return False
        else:
            print(f"❌ GET /auth/me failed with status {me_response.status_code}")
            print(f"   Response: {me_response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ Exception during test - {str(e)}")
        return False


def test_smoke_regression():
    """
    TEST 4: Smoke test - verify other endpoints still work (no auth/bcrypt related errors)
    """
    print("\n### TEST 4: Smoke test regression (other endpoints)")
    print("-" * 80)
    
    endpoints = [
        "/feed",
        "/uploads",
        "/challenges"
    ]
    
    all_passed = True
    
    # First login to get a token
    try:
        login_response = requests.post(
            f"{API_BASE}/auth/login",
            json={"username": "marcos", "password": "Test12345"},
            headers={"Content-Type": "application/json"}
        )
        
        if login_response.status_code != 200:
            print(f"❌ Login failed for smoke test")
            return False
        
        token = login_response.json().get("token")
        
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{API_BASE}{endpoint}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 200:
                    print(f"✅ GET {endpoint}: 200 OK")
                else:
                    print(f"⚠️  GET {endpoint}: {response.status_code} (may be expected)")
                    
            except Exception as e:
                print(f"❌ GET {endpoint}: Exception - {str(e)}")
                all_passed = False
        
        return all_passed
        
    except Exception as e:
        print(f"❌ Exception during smoke test - {str(e)}")
        return False


def main():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("BCRYPT -> BCRYPTJS MIGRATION VERIFICATION")
    print("=" * 80)
    
    results = {
        "test1_existing_users": test_login_existing_users(),
        "test2_new_user": test_register_new_user(),
        "test3_auth_me": test_auth_me(),
        "test4_smoke": test_smoke_regression()
    }
    
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    
    print("\n" + "=" * 80)
    if all_passed:
        print("🎉 ALL TESTS PASSED - bcryptjs migration successful!")
        print("=" * 80)
        return 0
    else:
        print("⚠️  SOME TESTS FAILED - review results above")
        print("=" * 80)
        return 1


if __name__ == "__main__":
    sys.exit(main())
