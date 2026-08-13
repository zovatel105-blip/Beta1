#!/usr/bin/env python3
"""
Backend test for POST /api/ai/edit-image endpoint
Tests the AI image editor feature in the Twyk app
"""

import requests
import base64
import io
import os
import sys
from pathlib import Path

# Base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://single-post-concept.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test credentials
TEST_USER = {
    'username': 'lucia',
    'password': 'Test12345'
}

def print_test(name):
    """Print test name"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_pass(msg):
    """Print pass message"""
    print(f"✅ PASS: {msg}")

def print_fail(msg):
    """Print fail message"""
    print(f"❌ FAIL: {msg}")

def login(username, password):
    """Login and return session cookie"""
    try:
        print(f"\n🔐 Logging in as {username}...")
        response = requests.post(
            f"{API_URL}/auth/login",
            json={'username': username, 'password': password},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                # Get session cookie
                session_cookie = response.cookies.get('session_token')
                if session_cookie:
                    print_pass(f"Logged in as {username}, got session cookie")
                    return {'session_token': session_cookie}
                else:
                    print_fail(f"Login succeeded but no session cookie received")
                    return None
            else:
                print_fail(f"Login response ok=False: {data}")
                return None
        else:
            print_fail(f"Login failed with status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print_fail(f"Login exception: {e}")
        return None

def test_unauthorized_access():
    """Test 1: POST /api/ai/edit-image WITHOUT login (expect 401)"""
    print_test("Unauthorized access (no session cookie)")
    
    try:
        # Try to access without session
        response = requests.post(
            f"{API_URL}/ai/edit-image",
            files={'image': ('test.jpg', b'fake', 'image/jpeg')},
            data={'prompt': 'Add a jet'},
            timeout=10
        )
        
        if response.status_code == 401:
            data = response.json()
            if data.get('error') == 'unauthorized':
                print_pass(f"Got 401 unauthorized as expected: {data}")
                return True
            else:
                print_fail(f"Got 401 but wrong error: {data}")
                return False
        else:
            print_fail(f"Expected 401, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_missing_image(cookies):
    """Test 2: POST without image file (expect 400)"""
    print_test("Missing image file")
    
    try:
        response = requests.post(
            f"{API_URL}/ai/edit-image",
            data={'prompt': 'Add a private jet in the background'},
            cookies=cookies,
            timeout=10
        )
        
        if response.status_code == 400:
            data = response.json()
            if data.get('error') == 'missing_image':
                print_pass(f"Got 400 missing_image as expected: {data}")
                return True
            else:
                print_fail(f"Got 400 but wrong error: {data}")
                return False
        else:
            print_fail(f"Expected 400, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_missing_prompt(cookies, image_path):
    """Test 3: POST with image but empty/too-short prompt (expect 400)"""
    print_test("Missing or too-short prompt")
    
    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()
        
        # Test with very short prompt (1 character)
        response = requests.post(
            f"{API_URL}/ai/edit-image",
            files={'image': ('test.jpg', image_data, 'image/jpeg')},
            data={'prompt': 'a'},
            cookies=cookies,
            timeout=10
        )
        
        if response.status_code == 400:
            data = response.json()
            if data.get('error') == 'missing_prompt':
                print_pass(f"Got 400 missing_prompt for short prompt as expected: {data}")
                return True
            else:
                print_fail(f"Got 400 but wrong error: {data}")
                return False
        else:
            print_fail(f"Expected 400, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_invalid_image_type(cookies):
    """Test 4: POST with non-image file (expect 415)"""
    print_test("Invalid image type (text file)")
    
    try:
        # Create a fake text file
        fake_text = b"This is not an image"
        
        response = requests.post(
            f"{API_URL}/ai/edit-image",
            files={'image': ('test.txt', fake_text, 'text/plain')},
            data={'prompt': 'Add a private jet in the background'},
            cookies=cookies,
            timeout=10
        )
        
        if response.status_code == 415:
            data = response.json()
            if data.get('error') == 'invalid_image':
                print_pass(f"Got 415 invalid_image as expected: {data}")
                return True
            else:
                print_fail(f"Got 415 but wrong error: {data}")
                return False
        else:
            print_fail(f"Expected 415, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_successful_edit(cookies, image_path):
    """Test 5: POST with valid image and prompt (expect 200 with base64 image)"""
    print_test("Successful AI image edit with real image")
    
    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()
        
        print(f"📤 Uploading image ({len(image_data)} bytes) with prompt...")
        print("⏳ This may take 10-30 seconds (calling real AI model)...")
        
        response = requests.post(
            f"{API_URL}/ai/edit-image",
            files={'image': ('test.jpg', image_data, 'image/jpeg')},
            data={'prompt': 'Add a realistic private jet flying in the background sky'},
            cookies=cookies,
            timeout=90  # Generous timeout for AI processing
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok') and 'image' in data:
                image_data_url = data['image']
                
                # Verify it's a valid data URL
                if image_data_url.startswith('data:image/'):
                    # Extract base64 part
                    if ';base64,' in image_data_url:
                        base64_part = image_data_url.split(';base64,')[1]
                        
                        # Try to decode to verify it's valid base64
                        try:
                            decoded = base64.b64decode(base64_part)
                            if len(decoded) > 100:  # Sanity check - should be a real image
                                print_pass(f"Got 200 with valid base64 image data URL")
                                print(f"   Image size: {len(decoded)} bytes")
                                print(f"   Data URL prefix: {image_data_url[:50]}...")
                                return True
                            else:
                                print_fail(f"Base64 decoded but too small ({len(decoded)} bytes)")
                                return False
                        except Exception as e:
                            print_fail(f"Failed to decode base64: {e}")
                            return False
                    else:
                        print_fail(f"Data URL missing ';base64,' separator")
                        return False
                else:
                    print_fail(f"Image field doesn't start with 'data:image/': {image_data_url[:50]}")
                    return False
            else:
                print_fail(f"Got 200 but response missing 'ok' or 'image': {data}")
                return False
        else:
            print_fail(f"Expected 200, got {response.status_code}: {response.text}")
            return False
    except requests.exceptions.Timeout:
        print_fail("Request timed out (AI processing took too long)")
        return False
    except Exception as e:
        print_fail(f"Exception: {e}")
        return False

def test_regression_endpoints(cookies):
    """Test 6: Regression check - verify other endpoints still work"""
    print_test("Regression check on other endpoints")
    
    results = []
    
    # Test GET /api/feed
    try:
        print("\n📡 Testing GET /api/feed...")
        response = requests.get(f"{API_URL}/feed?cursor=0&limit=8", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if 'posts' in data:
                print_pass(f"GET /api/feed returned 200 with {len(data['posts'])} posts")
                results.append(True)
            else:
                print_fail(f"GET /api/feed returned 200 but no 'posts' field: {data}")
                results.append(False)
        else:
            print_fail(f"GET /api/feed returned {response.status_code}: {response.text}")
            results.append(False)
    except Exception as e:
        print_fail(f"GET /api/feed exception: {e}")
        results.append(False)
    
    # Test GET /api/uploads
    try:
        print("\n📡 Testing GET /api/uploads...")
        response = requests.get(f"{API_URL}/uploads", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if 'posts' in data:
                print_pass(f"GET /api/uploads returned 200 with {len(data['posts'])} posts")
                results.append(True)
            else:
                print_fail(f"GET /api/uploads returned 200 but no 'posts' field: {data}")
                results.append(False)
        else:
            print_fail(f"GET /api/uploads returned {response.status_code}: {response.text}")
            results.append(False)
    except Exception as e:
        print_fail(f"GET /api/uploads exception: {e}")
        results.append(False)
    
    # Test POST /api/auth/login (already tested, but verify it still works)
    try:
        print("\n📡 Testing POST /api/auth/login...")
        response = requests.post(
            f"{API_URL}/auth/login",
            json={'username': 'marcos', 'password': 'Test12345'},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                print_pass(f"POST /api/auth/login returned 200 ok=True")
                results.append(True)
            else:
                print_fail(f"POST /api/auth/login returned 200 but ok=False: {data}")
                results.append(False)
        else:
            print_fail(f"POST /api/auth/login returned {response.status_code}: {response.text}")
            results.append(False)
    except Exception as e:
        print_fail(f"POST /api/auth/login exception: {e}")
        results.append(False)
    
    return all(results)

def main():
    """Main test runner"""
    print("\n" + "="*80)
    print("BACKEND TEST: POST /api/ai/edit-image")
    print("Testing AI Image Editor endpoint in Twyk app")
    print("="*80)
    
    # Find a real image to use
    uploads_dir = Path('/app/public/uploads')
    jpg_files = list(uploads_dir.glob('*.jpg'))
    
    if not jpg_files:
        print_fail("No JPG files found in /app/public/uploads/")
        sys.exit(1)
    
    test_image = jpg_files[0]
    print(f"\n📸 Using test image: {test_image}")
    
    results = {}
    
    # Test 1: Unauthorized access
    results['unauthorized'] = test_unauthorized_access()
    
    # Login to get session cookie
    cookies = login(TEST_USER['username'], TEST_USER['password'])
    
    if not cookies:
        print_fail("Failed to login, cannot continue with authenticated tests")
        sys.exit(1)
    
    # Test 2: Missing image
    results['missing_image'] = test_missing_image(cookies)
    
    # Test 3: Missing/short prompt
    results['missing_prompt'] = test_missing_prompt(cookies, test_image)
    
    # Test 4: Invalid image type
    results['invalid_image_type'] = test_invalid_image_type(cookies)
    
    # Test 5: Successful edit (this is the main test, may take 10-30 seconds)
    results['successful_edit'] = test_successful_edit(cookies, test_image)
    
    # Test 6: Regression check
    results['regression'] = test_regression_endpoints(cookies)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    failed = total - passed
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "-"*80)
    print(f"Total: {total} tests | Passed: {passed} | Failed: {failed}")
    print("-"*80)
    
    if failed > 0:
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == '__main__':
    main()
