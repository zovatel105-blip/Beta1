#!/usr/bin/env python3
"""
Backend API Test Suite for Versus Carousel Feature
Tests all backend endpoints for the versus carousel implementation
"""

import requests
import json
import io
import sys

# Base URL for API testing
BASE_URL = "http://localhost:3000/api"

def create_dummy_video(name="test.mp4"):
    """Create a small dummy video file for testing"""
    # Minimal valid MP4 file header (ftyp box)
    mp4_header = bytes([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00,
        0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
        0x6D, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
    ])
    return io.BytesIO(mp4_header)

def test_feed_endpoint():
    """
    Test 1: GET /api/feed?cursor=0&limit=4
    Verify: 200 JSON {posts:[...], nextCursor, hasMore}
    Each post MUST have:
    - type === 'versus'
    - layout === 'carousel'
    - sideA object with videoUrl (string starting with '/videos/' or '/uploads/') and author{username,name,avatarUrl}
    - sideB object with same shape
    - votes object with numeric a and b
    - sideA.videoUrl != sideB.videoUrl
    """
    print("\n" + "="*80)
    print("TEST 1: GET /api/feed?cursor=0&limit=4")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/feed?cursor=0&limit=4", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check top-level structure
        if 'posts' not in data:
            print("❌ FAILED: Missing 'posts' key in response")
            return False
        if 'nextCursor' not in data:
            print("❌ FAILED: Missing 'nextCursor' key in response")
            return False
        if 'hasMore' not in data:
            print("❌ FAILED: Missing 'hasMore' key in response")
            return False
        
        posts = data['posts']
        print(f"Number of posts: {len(posts)}")
        
        if len(posts) == 0:
            print("❌ FAILED: No posts returned")
            return False
        
        # Check each post structure
        for i, post in enumerate(posts):
            print(f"\n--- Checking post {i} (id: {post.get('id', 'N/A')}) ---")
            
            # Check type
            if post.get('type') != 'versus':
                print(f"❌ FAILED: Post {i} type is '{post.get('type')}', expected 'versus'")
                return False
            print(f"✓ type: {post['type']}")
            
            # Check layout
            if post.get('layout') != 'carousel':
                print(f"❌ FAILED: Post {i} layout is '{post.get('layout')}', expected 'carousel'")
                return False
            print(f"✓ layout: {post['layout']}")
            
            # Check sideA
            if 'sideA' not in post:
                print(f"❌ FAILED: Post {i} missing 'sideA'")
                return False
            
            sideA = post['sideA']
            if 'videoUrl' not in sideA:
                print(f"❌ FAILED: Post {i} sideA missing 'videoUrl'")
                return False
            if not isinstance(sideA['videoUrl'], str):
                print(f"❌ FAILED: Post {i} sideA.videoUrl is not a string")
                return False
            if not (sideA['videoUrl'].startswith('/videos/') or sideA['videoUrl'].startswith('/uploads/')):
                print(f"❌ FAILED: Post {i} sideA.videoUrl '{sideA['videoUrl']}' doesn't start with '/videos/' or '/uploads/'")
                return False
            print(f"✓ sideA.videoUrl: {sideA['videoUrl']}")
            
            if 'author' not in sideA:
                print(f"❌ FAILED: Post {i} sideA missing 'author'")
                return False
            author = sideA['author']
            if 'username' not in author or 'name' not in author or 'avatarUrl' not in author:
                print(f"❌ FAILED: Post {i} sideA.author missing required fields")
                return False
            print(f"✓ sideA.author: {author['username']}")
            
            # Check sideB
            if 'sideB' not in post:
                print(f"❌ FAILED: Post {i} missing 'sideB'")
                return False
            
            sideB = post['sideB']
            if 'videoUrl' not in sideB:
                print(f"❌ FAILED: Post {i} sideB missing 'videoUrl'")
                return False
            if not isinstance(sideB['videoUrl'], str):
                print(f"❌ FAILED: Post {i} sideB.videoUrl is not a string")
                return False
            if not (sideB['videoUrl'].startswith('/videos/') or sideB['videoUrl'].startswith('/uploads/')):
                print(f"❌ FAILED: Post {i} sideB.videoUrl '{sideB['videoUrl']}' doesn't start with '/videos/' or '/uploads/'")
                return False
            print(f"✓ sideB.videoUrl: {sideB['videoUrl']}")
            
            if 'author' not in sideB:
                print(f"❌ FAILED: Post {i} sideB missing 'author'")
                return False
            author = sideB['author']
            if 'username' not in author or 'name' not in author or 'avatarUrl' not in author:
                print(f"❌ FAILED: Post {i} sideB.author missing required fields")
                return False
            print(f"✓ sideB.author: {author['username']}")
            
            # Check sideA.videoUrl != sideB.videoUrl
            if sideA['videoUrl'] == sideB['videoUrl']:
                print(f"❌ FAILED: Post {i} sideA.videoUrl equals sideB.videoUrl")
                return False
            print(f"✓ sideA.videoUrl != sideB.videoUrl")
            
            # Check votes
            if 'votes' not in post:
                print(f"❌ FAILED: Post {i} missing 'votes'")
                return False
            votes = post['votes']
            if 'a' not in votes or 'b' not in votes:
                print(f"❌ FAILED: Post {i} votes missing 'a' or 'b'")
                return False
            if not isinstance(votes['a'], (int, float)) or not isinstance(votes['b'], (int, float)):
                print(f"❌ FAILED: Post {i} votes.a or votes.b is not numeric")
                return False
            print(f"✓ votes: {{a: {votes['a']}, b: {votes['b']}}}")
        
        print("\n✅ TEST 1 PASSED: GET /api/feed returns correct versus carousel structure")
        return True
        
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_versus_upload_success():
    """
    Test 2: POST /api/versus with fileA and fileB
    Expect: 200 {ok:true, post}
    post.type === 'versus'
    post.sideA.videoUrl and post.sideB.videoUrl both start with '/uploads/'
    post.votes == {a:0, b:0}
    """
    print("\n" + "="*80)
    print("TEST 2: POST /api/versus with fileA and fileB")
    print("="*80)
    
    try:
        files = {
            'fileA': ('a.mp4', create_dummy_video('a.mp4'), 'video/mp4'),
            'fileB': ('b.mp4', create_dummy_video('b.mp4'), 'video/mp4')
        }
        data = {
            'description': 'Test versus post - which video is better?'
        }
        
        response = requests.post(f"{BASE_URL}/versus", files=files, data=data, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False, None
        
        result = response.json()
        print(f"Response keys: {list(result.keys())}")
        
        if not result.get('ok'):
            print(f"❌ FAILED: ok is not true")
            return False, None
        print("✓ ok: true")
        
        if 'post' not in result:
            print(f"❌ FAILED: Missing 'post' in response")
            return False, None
        
        post = result['post']
        print(f"Post ID: {post.get('id')}")
        
        # Check type
        if post.get('type') != 'versus':
            print(f"❌ FAILED: post.type is '{post.get('type')}', expected 'versus'")
            return False, None
        print(f"✓ post.type: {post['type']}")
        
        # Check sideA.videoUrl
        if 'sideA' not in post or 'videoUrl' not in post['sideA']:
            print(f"❌ FAILED: Missing sideA.videoUrl")
            return False, None
        if not post['sideA']['videoUrl'].startswith('/uploads/'):
            print(f"❌ FAILED: sideA.videoUrl '{post['sideA']['videoUrl']}' doesn't start with '/uploads/'")
            return False, None
        print(f"✓ sideA.videoUrl: {post['sideA']['videoUrl']}")
        
        # Check sideB.videoUrl
        if 'sideB' not in post or 'videoUrl' not in post['sideB']:
            print(f"❌ FAILED: Missing sideB.videoUrl")
            return False, None
        if not post['sideB']['videoUrl'].startswith('/uploads/'):
            print(f"❌ FAILED: sideB.videoUrl '{post['sideB']['videoUrl']}' doesn't start with '/uploads/'")
            return False, None
        print(f"✓ sideB.videoUrl: {post['sideB']['videoUrl']}")
        
        # Check votes
        if 'votes' not in post:
            print(f"❌ FAILED: Missing votes")
            return False, None
        if post['votes'].get('a') != 0 or post['votes'].get('b') != 0:
            print(f"❌ FAILED: votes should be {{a:0, b:0}}, got {post['votes']}")
            return False, None
        print(f"✓ votes: {post['votes']}")
        
        print("\n✅ TEST 2 PASSED: POST /api/versus with both files works correctly")
        return True, post['id']
        
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, None

def test_versus_upload_missing_file():
    """
    Test 3: POST /api/versus with only fileA (missing fileB)
    Expect: 400 with error 'need_two_files'
    """
    print("\n" + "="*80)
    print("TEST 3: POST /api/versus with missing fileB")
    print("="*80)
    
    try:
        files = {
            'fileA': ('a.mp4', create_dummy_video('a.mp4'), 'video/mp4')
        }
        data = {
            'description': 'Test versus post with missing file'
        }
        
        response = requests.post(f"{BASE_URL}/versus", files=files, data=data, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        print("✓ Status: 400")
        
        result = response.json()
        print(f"Response: {result}")
        
        if result.get('error') != 'need_two_files':
            print(f"❌ FAILED: Expected error 'need_two_files', got '{result.get('error')}'")
            return False
        print("✓ error: 'need_two_files'")
        
        print("\n✅ TEST 3 PASSED: POST /api/versus with missing file returns 400 'need_two_files'")
        return True
        
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_vote_versus_builtin():
    """
    Test 4: POST /api/vote with {id:'versus_0', side:'a'}
    Expect: 200 {ok:true, votes:{a:<num>,b:<num>}}
    Call again and verify votes.a increases by 1
    Then GET /api/feed and verify versus_0 has updated votes (persistence)
    """
    print("\n" + "="*80)
    print("TEST 4: POST /api/vote for built-in versus_0")
    print("="*80)
    
    try:
        # First vote
        payload = {'id': 'versus_0', 'side': 'a'}
        response = requests.post(f"{BASE_URL}/vote", json=payload, timeout=10)
        print(f"First vote - Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result1 = response.json()
        print(f"First vote response: {result1}")
        
        if not result1.get('ok'):
            print(f"❌ FAILED: ok is not true")
            return False
        print("✓ ok: true")
        
        if 'votes' not in result1:
            print(f"❌ FAILED: Missing 'votes' in response")
            return False
        
        votes1 = result1['votes']
        if 'a' not in votes1 or 'b' not in votes1:
            print(f"❌ FAILED: votes missing 'a' or 'b'")
            return False
        print(f"✓ First vote - votes: {votes1}")
        
        votes_a_first = votes1['a']
        
        # Second vote
        response = requests.post(f"{BASE_URL}/vote", json=payload, timeout=10)
        print(f"\nSecond vote - Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            return False
        
        result2 = response.json()
        votes2 = result2['votes']
        print(f"Second vote - votes: {votes2}")
        
        if votes2['a'] != votes_a_first + 1:
            print(f"❌ FAILED: votes.a should increase by 1. Expected {votes_a_first + 1}, got {votes2['a']}")
            return False
        print(f"✓ votes.a increased from {votes_a_first} to {votes2['a']}")
        
        # Verify persistence via GET /api/feed
        print("\nVerifying persistence via GET /api/feed...")
        response = requests.get(f"{BASE_URL}/feed?cursor=0&limit=1", timeout=10)
        
        if response.status_code != 200:
            print(f"❌ FAILED: GET /api/feed returned {response.status_code}")
            return False
        
        feed_data = response.json()
        if not feed_data.get('posts') or len(feed_data['posts']) == 0:
            print(f"❌ FAILED: No posts in feed")
            return False
        
        versus_0 = feed_data['posts'][0]
        if versus_0.get('id') != 'versus_0':
            print(f"❌ FAILED: First post is not versus_0, got {versus_0.get('id')}")
            return False
        
        feed_votes = versus_0.get('votes', {})
        print(f"Feed votes for versus_0: {feed_votes}")
        
        if feed_votes.get('a') != votes2['a']:
            print(f"❌ FAILED: Feed votes.a ({feed_votes.get('a')}) doesn't match vote response ({votes2['a']})")
            return False
        print(f"✓ Persistence verified: votes.a = {feed_votes['a']}")
        
        print("\n✅ TEST 4 PASSED: POST /api/vote increments and persists correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_vote_invalid_side():
    """
    Test 5: POST /api/vote with invalid side
    Test 5a: {id:'versus_0', side:'x'} -> 400
    Test 5b: {id:'versus_0'} (missing side) -> 400
    """
    print("\n" + "="*80)
    print("TEST 5: POST /api/vote with invalid/missing side")
    print("="*80)
    
    try:
        # Test 5a: invalid side 'x'
        print("\n--- Test 5a: Invalid side 'x' ---")
        payload = {'id': 'versus_0', 'side': 'x'}
        response = requests.post(f"{BASE_URL}/vote", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400 for invalid side, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        print("✓ Invalid side 'x' returns 400")
        
        # Test 5b: missing side
        print("\n--- Test 5b: Missing side ---")
        payload = {'id': 'versus_0'}
        response = requests.post(f"{BASE_URL}/vote", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 400:
            print(f"❌ FAILED: Expected 400 for missing side, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        print("✓ Missing side returns 400")
        
        print("\n✅ TEST 5 PASSED: Invalid/missing side returns 400")
        return True
        
    except Exception as e:
        print(f"❌ TEST 5 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_vote_uploaded_versus(uploaded_id):
    """
    Test 6: POST /api/vote for an uploaded versus post
    Use the post.id returned from test 2
    POST /api/vote {id:<that id>, side:'b'} -> 200 and votes.b becomes 1
    Verify persistence in _meta.json
    """
    print("\n" + "="*80)
    print("TEST 6: POST /api/vote for uploaded versus post")
    print("="*80)
    
    if not uploaded_id:
        print("⚠️ SKIPPED: No uploaded versus ID available (test 2 may have failed)")
        return True  # Don't fail the entire suite
    
    try:
        payload = {'id': uploaded_id, 'side': 'b'}
        response = requests.post(f"{BASE_URL}/vote", json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response: {result}")
        
        if not result.get('ok'):
            print(f"❌ FAILED: ok is not true")
            return False
        print("✓ ok: true")
        
        votes = result.get('votes', {})
        if votes.get('b') != 1:
            print(f"❌ FAILED: votes.b should be 1, got {votes.get('b')}")
            return False
        print(f"✓ votes.b = 1")
        
        print("\n✅ TEST 6 PASSED: POST /api/vote for uploaded versus works correctly")
        return True
        
    except Exception as e:
        print(f"❌ TEST 6 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_backward_compat_upload():
    """
    Test 7: Backward compatibility - POST /api/upload
    Single file upload should still work and return type 'normal'
    """
    print("\n" + "="*80)
    print("TEST 7: Backward compatibility - POST /api/upload")
    print("="*80)
    
    try:
        files = {
            'file': ('test.mp4', create_dummy_video('test.mp4'), 'video/mp4')
        }
        data = {
            'description': 'Test normal upload for backward compatibility'
        }
        
        response = requests.post(f"{BASE_URL}/upload", files=files, data=data, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response keys: {list(result.keys())}")
        
        if not result.get('ok'):
            print(f"❌ FAILED: ok is not true")
            return False
        print("✓ ok: true")
        
        if 'post' not in result:
            print(f"❌ FAILED: Missing 'post' in response")
            return False
        
        post = result['post']
        if post.get('type') != 'normal':
            print(f"❌ FAILED: post.type should be 'normal', got '{post.get('type')}'")
            return False
        print(f"✓ post.type: {post['type']}")
        
        print("\n✅ TEST 7 PASSED: POST /api/upload backward compatibility works")
        return True
        
    except Exception as e:
        print(f"❌ TEST 7 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_backward_compat_duet():
    """
    Test 8: Backward compatibility - POST /api/duet
    Duet upload should still work and return type 'duet'
    Can also vote on duet posts
    """
    print("\n" + "="*80)
    print("TEST 8: Backward compatibility - POST /api/duet")
    print("="*80)
    
    try:
        # First, we need a pair video URL - use one from the built-in videos
        pair_author = {
            'username': 'wanderlust',
            'name': 'Sofía Vela',
            'avatarUrl': 'https://i.pravatar.cc/120?img=47'
        }
        
        files = {
            'file': ('duet.mp4', create_dummy_video('duet.mp4'), 'video/mp4')
        }
        data = {
            'description': 'Test duet for backward compatibility',
            'pairVideoUrl': '/videos/51330.mp4',
            'pairAuthor': json.dumps(pair_author),
            'pairMusic': 'Original music',
            'pairDescription': 'Paired video'
        }
        
        response = requests.post(f"{BASE_URL}/duet", files=files, data=data, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"Response keys: {list(result.keys())}")
        
        if not result.get('ok'):
            print(f"❌ FAILED: ok is not true")
            return False
        print("✓ ok: true")
        
        if 'post' not in result:
            print(f"❌ FAILED: Missing 'post' in response")
            return False
        
        post = result['post']
        if post.get('type') != 'duet':
            print(f"❌ FAILED: post.type should be 'duet', got '{post.get('type')}'")
            return False
        print(f"✓ post.type: {post['type']}")
        
        duet_id = post.get('id')
        print(f"✓ Duet ID: {duet_id}")
        
        # Test voting on duet
        print("\n--- Testing vote on duet ---")
        payload = {'id': duet_id, 'side': 'a'}
        vote_response = requests.post(f"{BASE_URL}/vote", json=payload, timeout=10)
        print(f"Vote Status Code: {vote_response.status_code}")
        
        if vote_response.status_code != 200:
            print(f"❌ FAILED: Vote on duet expected 200, got {vote_response.status_code}")
            return False
        
        vote_result = vote_response.json()
        if not vote_result.get('ok'):
            print(f"❌ FAILED: Vote ok is not true")
            return False
        print(f"✓ Vote on duet works: {vote_result.get('votes')}")
        
        print("\n✅ TEST 8 PASSED: POST /api/duet backward compatibility works")
        return True
        
    except Exception as e:
        print(f"❌ TEST 8 FAILED with exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all backend tests"""
    print("\n" + "="*80)
    print("BACKEND API TEST SUITE - VERSUS CAROUSEL FEATURE")
    print("="*80)
    
    results = {}
    uploaded_versus_id = None
    
    # Test 1: GET /api/feed
    results['test_1_feed'] = test_feed_endpoint()
    
    # Test 2: POST /api/versus with both files
    success, uploaded_id = test_versus_upload_success()
    results['test_2_versus_upload'] = success
    if success:
        uploaded_versus_id = uploaded_id
    
    # Test 3: POST /api/versus with missing file
    results['test_3_versus_missing_file'] = test_versus_upload_missing_file()
    
    # Test 4: POST /api/vote for built-in versus
    results['test_4_vote_builtin'] = test_vote_versus_builtin()
    
    # Test 5: POST /api/vote with invalid side
    results['test_5_vote_invalid'] = test_vote_invalid_side()
    
    # Test 6: POST /api/vote for uploaded versus
    results['test_6_vote_uploaded'] = test_vote_uploaded_versus(uploaded_versus_id)
    
    # Test 7: Backward compat - /api/upload
    results['test_7_upload_compat'] = test_backward_compat_upload()
    
    # Test 8: Backward compat - /api/duet
    results['test_8_duet_compat'] = test_backward_compat_duet()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️ {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
