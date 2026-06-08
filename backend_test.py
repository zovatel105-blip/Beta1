#!/usr/bin/env python3
"""
Backend API Testing Script for SnapTok Challenge Feature
Tests all modified/new endpoints in /app/app/api/[[...path]]/route.js
"""

import requests
import json
import io
import sys

# Base URL for API testing
BASE_URL = "http://localhost:3000/api"

def create_dummy_mp4():
    """Create a dummy MP4 file content for testing"""
    # Minimal valid MP4 header
    return b'\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6f\x6d\x00\x00\x02\x00' + b'\x00' * 100

def test_get_users():
    """Test 1: GET /api/users -> 200 {users:[...]} lista no vacía"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/users")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/users")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify structure
        if 'users' not in data:
            print("❌ FAILED: Response missing 'users' field")
            return False
        
        users = data['users']
        if not isinstance(users, list) or len(users) == 0:
            print("❌ FAILED: 'users' should be a non-empty list")
            return False
        
        # Check each user has required fields
        for user in users:
            if not all(key in user for key in ['username', 'name', 'avatarUrl']):
                print(f"❌ FAILED: User missing required fields: {user}")
                return False
            
            # Should NOT include 'tu_canal'
            if user['username'] == 'tu_canal':
                print(f"❌ FAILED: Should not include username 'tu_canal'")
                return False
        
        print(f"✅ PASSED: Found {len(users)} users, all with correct structure")
        print(f"Sample user: {users[0]}")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        return False

def test_post_duet():
    """Test 2: POST /api/duet (multipart) with fileA and fileB"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/duet (multipart with fileA and fileB)")
    print("="*80)
    
    try:
        # Create dummy MP4 files
        fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
        fileB = ('videoB.mp4', create_dummy_mp4(), 'video/mp4')
        
        files = {
            'fileA': fileA,
            'fileB': fileB
        }
        data = {
            'layout': 'vertical',
            'description': 'Mi 1vs1'
        }
        
        response = requests.post(f"{BASE_URL}/duet", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        # Verify structure
        if not result.get('ok'):
            print("❌ FAILED: Response should have ok:true")
            return False, None
        
        post = result.get('post')
        if not post:
            print("❌ FAILED: Response missing 'post' field")
            return False, None
        
        # Verify post structure
        checks = [
            (post.get('type') == 'duet', f"type should be 'duet', got {post.get('type')}"),
            (post.get('layout') == 'vertical', f"layout should be 'vertical', got {post.get('layout')}"),
            (post.get('sideA', {}).get('videoUrl', '').startswith('/uploads/'), 
             f"sideA.videoUrl should start with '/uploads/', got {post.get('sideA', {}).get('videoUrl')}"),
            (post.get('sideB', {}).get('videoUrl', '').startswith('/uploads/'), 
             f"sideB.videoUrl should start with '/uploads/', got {post.get('sideB', {}).get('videoUrl')}"),
            (post.get('sideA', {}).get('author', {}).get('username') == 'tu_canal',
             f"sideA.author.username should be 'tu_canal', got {post.get('sideA', {}).get('author', {}).get('username')}"),
            (post.get('sideB', {}).get('author', {}).get('username') == 'tu_canal',
             f"sideB.author.username should be 'tu_canal', got {post.get('sideB', {}).get('author', {}).get('username')}"),
        ]
        
        all_passed = True
        for check, msg in checks:
            if not check:
                print(f"❌ FAILED: {msg}")
                all_passed = False
        
        if not all_passed:
            return False, None
        
        # Verify it appears in GET /api/uploads
        uploads_response = requests.get(f"{BASE_URL}/uploads")
        if uploads_response.status_code == 200:
            uploads = uploads_response.json().get('posts', [])
            found = any(p.get('id') == post.get('id') for p in uploads)
            if not found:
                print(f"❌ FAILED: Post not found in GET /api/uploads")
                return False, None
            print(f"✅ Verified: Post found in GET /api/uploads")
        
        print(f"✅ PASSED: Duet created successfully with correct structure")
        return True, post.get('id')
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_post_duet_error():
    """Test 2b: POST /api/duet with only fileA (missing fileB) -> 400"""
    print("\n" + "="*80)
    print("TEST 2b: POST /api/duet with only fileA (error case)")
    print("="*80)
    
    try:
        fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
        files = {'fileA': fileA}
        data = {'layout': 'vertical', 'description': 'Test'}
        
        response = requests.post(f"{BASE_URL}/duet", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if result.get('error') != 'need_two_files':
            print(f"❌ FAILED: Expected error 'need_two_files', got {result.get('error')}")
            return False
        
        print(f"✅ PASSED: Correctly returns 400 with 'need_two_files' error")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        return False

def test_post_challenges_new_flow():
    """Test 3: POST /api/challenges (new flow - user target, no targetVideoUrl)"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/challenges (new flow - targetAuthor only)")
    print("="*80)
    
    try:
        file = ('video.mp4', create_dummy_mp4(), 'video/mp4')
        target_author = {
            "username": "urbanlife",
            "name": "Marco Ruiz",
            "avatarUrl": "https://i.pravatar.cc/120?img=12"
        }
        
        files = {'file': file}
        data = {
            'targetAuthor': json.dumps(target_author),
            'message': 'Te reto'
        }
        
        response = requests.post(f"{BASE_URL}/challenges", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if not result.get('ok'):
            print("❌ FAILED: Response should have ok:true")
            return False, None
        
        challenge = result.get('challenge')
        if not challenge:
            print("❌ FAILED: Response missing 'challenge' field")
            return False, None
        
        # Verify challenge structure
        checks = [
            (challenge.get('status') == 'pending', f"status should be 'pending', got {challenge.get('status')}"),
            (challenge.get('from', {}).get('username') == 'tu_canal',
             f"from.username should be 'tu_canal', got {challenge.get('from', {}).get('username')}"),
            (challenge.get('to', {}).get('username') == 'urbanlife',
             f"to.username should be 'urbanlife', got {challenge.get('to', {}).get('username')}"),
            (challenge.get('challengerVideoUrl', '').startswith('/uploads/'),
             f"challengerVideoUrl should start with '/uploads/', got {challenge.get('challengerVideoUrl')}"),
            (challenge.get('targetVideoUrl') is None,
             f"targetVideoUrl should be null, got {challenge.get('targetVideoUrl')}"),
        ]
        
        all_passed = True
        for check, msg in checks:
            if not check:
                print(f"❌ FAILED: {msg}")
                all_passed = False
        
        if not all_passed:
            return False, None
        
        print(f"✅ PASSED: Challenge created successfully with correct structure")
        return True, challenge.get('id')
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_post_challenges_errors():
    """Test 3b: POST /api/challenges error cases"""
    print("\n" + "="*80)
    print("TEST 3b: POST /api/challenges error cases")
    print("="*80)
    
    # Test without file
    print("\n--- Testing without file ---")
    try:
        target_author = {"username": "urbanlife", "name": "Marco Ruiz", "avatarUrl": "https://x"}
        data = {'targetAuthor': json.dumps(target_author), 'message': 'Test'}
        
        response = requests.post(f"{BASE_URL}/challenges", data=data)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        result = response.json()
        if result.get('error') != 'no_file':
            print(f"❌ FAILED: Expected error 'no_file', got {result.get('error')}")
            return False
        
        print(f"✅ PASSED: Correctly returns 400 with 'no_file' error")
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        return False
    
    # Test without targetAuthor
    print("\n--- Testing without targetAuthor ---")
    try:
        file = ('video.mp4', create_dummy_mp4(), 'video/mp4')
        files = {'file': file}
        data = {'message': 'Test'}
        
        response = requests.post(f"{BASE_URL}/challenges", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            return False
        
        result = response.json()
        if result.get('error') != 'no_target':
            print(f"❌ FAILED: Expected error 'no_target', got {result.get('error')}")
            return False
        
        print(f"✅ PASSED: Correctly returns 400 with 'no_target' error")
        return True
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        return False

def test_get_challenges(expected_challenge_id=None):
    """Test 4: GET /api/challenges"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/challenges")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/challenges")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if 'challenges' not in data:
            print("❌ FAILED: Response missing 'challenges' field")
            return False
        
        challenges = data['challenges']
        if not isinstance(challenges, list):
            print("❌ FAILED: 'challenges' should be a list")
            return False
        
        if expected_challenge_id:
            found = any(c.get('id') == expected_challenge_id for c in challenges)
            if not found:
                print(f"❌ FAILED: Expected challenge {expected_challenge_id} not found")
                return False
            print(f"✅ Verified: Challenge {expected_challenge_id} found in list")
        
        print(f"✅ PASSED: GET /api/challenges returned {len(challenges)} challenges")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        return False

def test_accept_challenge_path_a(challenge_id):
    """Test 5: POST /api/challenges/{id}/accept - Path A (upload video on accept)"""
    print("\n" + "="*80)
    print("TEST 5: POST /api/challenges/{id}/accept - Path A (with file)")
    print("="*80)
    
    try:
        file = ('response.mp4', create_dummy_mp4(), 'video/mp4')
        files = {'file': file}
        
        response = requests.post(f"{BASE_URL}/challenges/{challenge_id}/accept", files=files)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if not result.get('ok'):
            print("❌ FAILED: Response should have ok:true")
            return False, None
        
        post = result.get('post')
        if not post:
            print("❌ FAILED: Response missing 'post' field")
            return False, None
        
        # Verify versus post structure
        checks = [
            (post.get('type') == 'versus', f"type should be 'versus', got {post.get('type')}"),
            (post.get('sideA', {}).get('videoUrl', '').startswith('/uploads/'),
             f"sideA.videoUrl should start with '/uploads/', got {post.get('sideA', {}).get('videoUrl')}"),
            (post.get('sideB', {}).get('videoUrl', '').startswith('/uploads/'),
             f"sideB.videoUrl should start with '/uploads/', got {post.get('sideB', {}).get('videoUrl')}"),
        ]
        
        all_passed = True
        for check, msg in checks:
            if not check:
                print(f"❌ FAILED: {msg}")
                all_passed = False
        
        if not all_passed:
            return False, None
        
        # Verify it appears in GET /api/uploads
        uploads_response = requests.get(f"{BASE_URL}/uploads")
        if uploads_response.status_code == 200:
            uploads = uploads_response.json().get('posts', [])
            found = any(p.get('id') == post.get('id') for p in uploads)
            if not found:
                print(f"❌ FAILED: Versus post not found in GET /api/uploads")
                return False, None
            print(f"✅ Verified: Versus post found in GET /api/uploads")
        
        # Verify challenge is removed from GET /api/challenges
        challenges_response = requests.get(f"{BASE_URL}/challenges")
        if challenges_response.status_code == 200:
            challenges = challenges_response.json().get('challenges', [])
            found = any(c.get('id') == challenge_id for c in challenges)
            if found:
                print(f"❌ FAILED: Challenge should be removed from GET /api/challenges")
                return False, None
            print(f"✅ Verified: Challenge removed from GET /api/challenges")
        
        print(f"✅ PASSED: Challenge accepted successfully (Path A)")
        return True, post.get('id')
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_challenges_compat_flow():
    """Test 6: POST /api/challenges with targetVideoUrl (compat mode)"""
    print("\n" + "="*80)
    print("TEST 6: POST /api/challenges with targetVideoUrl (compat)")
    print("="*80)
    
    try:
        file = ('video.mp4', create_dummy_mp4(), 'video/mp4')
        target_author = {
            "username": "oceanvibes",
            "name": "Lía",
            "avatarUrl": "https://i.pravatar.cc/120?img=32"
        }
        
        files = {'file': file}
        data = {
            'targetAuthor': json.dumps(target_author),
            'targetVideoUrl': '/videos/39880.mp4',
            'message': 'Reto compat'
        }
        
        response = requests.post(f"{BASE_URL}/challenges", files=files, data=data)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        challenge = result.get('challenge')
        if not challenge:
            print("❌ FAILED: Response missing 'challenge' field")
            return False, None
        
        # Verify targetVideoUrl is preserved
        if challenge.get('targetVideoUrl') != '/videos/39880.mp4':
            print(f"❌ FAILED: targetVideoUrl should be '/videos/39880.mp4', got {challenge.get('targetVideoUrl')}")
            return False, None
        
        print(f"✅ PASSED: Challenge created with targetVideoUrl")
        return True, challenge.get('id')
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False, None

def test_accept_challenge_path_b(challenge_id):
    """Test 6b: POST /api/challenges/{id}/accept - Path B (no file, use targetVideoUrl)"""
    print("\n" + "="*80)
    print("TEST 6b: POST /api/challenges/{id}/accept - Path B (without file)")
    print("="*80)
    
    try:
        # Accept without body (no multipart)
        response = requests.post(f"{BASE_URL}/challenges/{challenge_id}/accept")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if not result.get('ok'):
            print("❌ FAILED: Response should have ok:true")
            return False
        
        post = result.get('post')
        if not post:
            print("❌ FAILED: Response missing 'post' field")
            return False
        
        # Verify sideB uses the targetVideoUrl
        if post.get('sideB', {}).get('videoUrl') != '/videos/39880.mp4':
            print(f"❌ FAILED: sideB.videoUrl should be '/videos/39880.mp4', got {post.get('sideB', {}).get('videoUrl')}")
            return False
        
        # Verify challenge is removed
        challenges_response = requests.get(f"{BASE_URL}/challenges")
        if challenges_response.status_code == 200:
            challenges = challenges_response.json().get('challenges', [])
            found = any(c.get('id') == challenge_id for c in challenges)
            if found:
                print(f"❌ FAILED: Challenge should be removed from GET /api/challenges")
                return False
            print(f"✅ Verified: Challenge removed from GET /api/challenges")
        
        print(f"✅ PASSED: Challenge accepted successfully (Path B - compat)")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_accept_challenge_not_found():
    """Test 6c: POST /api/challenges/{id}/accept with non-existent id -> 404"""
    print("\n" + "="*80)
    print("TEST 6c: POST /api/challenges/accept with non-existent id")
    print("="*80)
    
    try:
        response = requests.post(f"{BASE_URL}/challenges/challenge_noexiste/accept")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 404:
            print(f"❌ FAILED: Expected 404, got {response.status_code}")
            return False
        
        print(f"✅ PASSED: Correctly returns 404 for non-existent challenge")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        return False

def test_reject_challenge():
    """Test 7: POST /api/challenges/{id}/reject"""
    print("\n" + "="*80)
    print("TEST 7: POST /api/challenges/{id}/reject")
    print("="*80)
    
    # First create a challenge to reject
    try:
        file = ('video.mp4', create_dummy_mp4(), 'video/mp4')
        target_author = {
            "username": "urbanlife",
            "name": "Marco Ruiz",
            "avatarUrl": "https://i.pravatar.cc/120?img=12"
        }
        
        files = {'file': file}
        data = {
            'targetAuthor': json.dumps(target_author),
            'message': 'Test reject'
        }
        
        response = requests.post(f"{BASE_URL}/challenges", files=files, data=data)
        if response.status_code != 200:
            print(f"❌ FAILED: Could not create challenge for reject test")
            return False
        
        challenge_id = response.json().get('challenge', {}).get('id')
        print(f"Created challenge: {challenge_id}")
        
        # Now reject it
        reject_response = requests.post(f"{BASE_URL}/challenges/{challenge_id}/reject")
        print(f"Reject Status Code: {reject_response.status_code}")
        
        if reject_response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {reject_response.status_code}")
            return False
        
        result = reject_response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if not result.get('ok'):
            print("❌ FAILED: Response should have ok:true")
            return False
        
        # Verify challenge is removed
        challenges_response = requests.get(f"{BASE_URL}/challenges")
        if challenges_response.status_code == 200:
            challenges = challenges_response.json().get('challenges', [])
            found = any(c.get('id') == challenge_id for c in challenges)
            if found:
                print(f"❌ FAILED: Challenge should be removed from GET /api/challenges")
                return False
            print(f"✅ Verified: Challenge removed from GET /api/challenges")
        
        print(f"✅ PASSED: Challenge rejected successfully")
        return True
        
    except Exception as e:
        print(f"❌ FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all backend tests"""
    print("\n" + "="*80)
    print("BACKEND API TESTING - SnapTok Challenge Feature")
    print("="*80)
    
    results = {}
    
    # Test 1: GET /api/users
    results['GET /api/users'] = test_get_users()
    
    # Test 2: POST /api/duet
    duet_success, duet_id = test_post_duet()
    results['POST /api/duet (success)'] = duet_success
    results['POST /api/duet (error)'] = test_post_duet_error()
    
    # Test 3: POST /api/challenges (new flow)
    challenge_success, challenge_id = test_post_challenges_new_flow()
    results['POST /api/challenges (new flow)'] = challenge_success
    results['POST /api/challenges (errors)'] = test_post_challenges_errors()
    
    # Test 4: GET /api/challenges
    results['GET /api/challenges'] = test_get_challenges(challenge_id if challenge_success else None)
    
    # Test 5: Accept challenge Path A (with file upload)
    if challenge_success and challenge_id:
        accept_success, versus_id = test_accept_challenge_path_a(challenge_id)
        results['POST /api/challenges/{id}/accept (Path A)'] = accept_success
    else:
        print("\n⚠️  Skipping accept test Path A - no valid challenge created")
        results['POST /api/challenges/{id}/accept (Path A)'] = False
    
    # Test 6: POST /api/challenges with targetVideoUrl (compat)
    compat_success, compat_challenge_id = test_challenges_compat_flow()
    results['POST /api/challenges (compat)'] = compat_success
    
    # Test 6b: Accept challenge Path B (without file)
    if compat_success and compat_challenge_id:
        results['POST /api/challenges/{id}/accept (Path B)'] = test_accept_challenge_path_b(compat_challenge_id)
    else:
        print("\n⚠️  Skipping accept test Path B - no valid compat challenge created")
        results['POST /api/challenges/{id}/accept (Path B)'] = False
    
    # Test 6c: Accept with non-existent id
    results['POST /api/challenges/{id}/accept (404)'] = test_accept_challenge_not_found()
    
    # Test 7: Reject challenge
    results['POST /api/challenges/{id}/reject'] = test_reject_challenge()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
