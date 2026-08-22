#!/usr/bin/env python3
"""
Backend test for Twyk Rank feature
Tests the new ranking system added to GET /api/users/:username
"""

import requests
import json
import sys

# Base URL from .env
BASE_URL = "https://native-web-gap.preview.emergentagent.com/api"

# Test credentials
TEST_USERS = [
    {"username": "twyk", "password": "Admin12345", "role": "admin"},
    {"username": "lucia", "password": "Test12345", "role": "user"},
    {"username": "marcos", "password": "Test12345", "role": "user"},
    {"username": "laura", "password": "Test12345", "role": "user"},
]

def login(username, password):
    """Login and return session token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": username, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        else:
            print(f"❌ Login failed for {username}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login exception for {username}: {str(e)}")
        return None

def get_user_profile(username, token=None):
    """Get user profile with optional authentication"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    response = requests.get(
        f"{BASE_URL}/users/{username}",
        headers=headers,
        timeout=10
    )
    return response

def test_rank_structure(username, response_data):
    """Test that rank object has correct structure"""
    print(f"\n  Testing rank structure for {username}...")
    
    if "user" not in response_data:
        print(f"    ❌ Missing 'user' key in response")
        return False
    
    user = response_data["user"]
    
    if "rank" not in user:
        print(f"    ❌ Missing 'rank' key in user object")
        return False
    
    rank = user["rank"]
    
    if rank is None:
        print(f"    ⚠️  rank is null (user might not be in ranking system)")
        return False
    
    # Check required keys
    required_keys = ["score", "rank", "total", "tier"]
    for key in required_keys:
        if key not in rank:
            print(f"    ❌ Missing required key '{key}' in rank object")
            return False
    
    # Check types
    if not isinstance(rank["score"], (int, float)):
        print(f"    ❌ 'score' should be a number, got {type(rank['score'])}")
        return False
    
    if not isinstance(rank["rank"], int) or rank["rank"] < 1:
        print(f"    ❌ 'rank' should be an integer >= 1, got {rank['rank']}")
        return False
    
    if not isinstance(rank["total"], int) or rank["total"] < rank["rank"]:
        print(f"    ❌ 'total' should be an integer >= rank, got {rank['total']}")
        return False
    
    # Check tier structure
    tier = rank["tier"]
    if not isinstance(tier, dict):
        print(f"    ❌ 'tier' should be an object, got {type(tier)}")
        return False
    
    tier_keys = ["name", "emoji", "from", "to"]
    for key in tier_keys:
        if key not in tier:
            print(f"    ❌ Missing required key '{key}' in tier object")
            return False
        if not isinstance(tier[key], str):
            print(f"    ❌ tier.{key} should be a string, got {type(tier[key])}")
            return False
    
    print(f"    ✅ Rank structure is valid")
    print(f"       Score: {rank['score']}, Rank: {rank['rank']}/{rank['total']}")
    print(f"       Tier: {tier['emoji']} {tier['name']}")
    return True

def test_rank_consistency(profiles):
    """Test that ranks are mutually consistent across users"""
    print(f"\n  Testing rank consistency across {len(profiles)} users...")
    
    ranks = []
    totals = []
    
    for username, data in profiles.items():
        if "user" in data and "rank" in data["user"] and data["user"]["rank"]:
            rank_obj = data["user"]["rank"]
            ranks.append((username, rank_obj["rank"]))
            totals.append(rank_obj["total"])
    
    if len(ranks) < 2:
        print(f"    ⚠️  Not enough users with ranks to test consistency")
        return True
    
    # Check all totals are the same
    if len(set(totals)) != 1:
        print(f"    ❌ Total counts are inconsistent: {totals}")
        return False
    
    print(f"    ✅ All users have same total count: {totals[0]}")
    
    # Check all ranks are different (assuming we have different users)
    rank_values = [r[1] for r in ranks]
    if len(rank_values) != len(set(rank_values)):
        print(f"    ⚠️  Some users have the same rank (might be tied scores)")
        print(f"       Ranks: {ranks}")
    else:
        print(f"    ✅ All users have different ranks")
    
    # Check ranks are within valid range
    total = totals[0]
    for username, rank in ranks:
        if rank < 1 or rank > total:
            print(f"    ❌ {username} has invalid rank {rank} (should be 1-{total})")
            return False
    
    print(f"    ✅ All ranks are within valid range (1-{total})")
    return True

def test_profile_regression(username, response_data):
    """Test that existing profile fields still work"""
    print(f"\n  Testing profile regression for {username}...")
    
    if "user" not in response_data:
        print(f"    ❌ Missing 'user' key")
        return False
    
    user = response_data["user"]
    
    # Check essential fields
    essential_fields = ["username", "followers", "following", "bio"]
    for field in essential_fields:
        if field not in user:
            print(f"    ❌ Missing essential field '{field}'")
            return False
    
    # Check posts array exists
    if "posts" not in response_data:
        print(f"    ❌ Missing 'posts' array")
        return False
    
    if not isinstance(response_data["posts"], list):
        print(f"    ❌ 'posts' should be an array")
        return False
    
    print(f"    ✅ Profile fields intact: username={user['username']}, followers={user['followers']}, following={user['following']}")
    print(f"    ✅ Posts array present with {len(response_data['posts'])} posts")
    return True

def main():
    print("=" * 80)
    print("TWYK RANK FEATURE TEST")
    print("=" * 80)
    
    all_passed = True
    
    # TEST 1: Get profiles for all test users and verify rank structure
    print("\n" + "=" * 80)
    print("TEST 1: Rank Structure Validation")
    print("=" * 80)
    
    profiles = {}
    for user_info in TEST_USERS:
        username = user_info["username"]
        print(f"\nFetching profile for {username}...")
        
        try:
            response = get_user_profile(username)
            
            if response.status_code != 200:
                print(f"❌ GET /api/users/{username} returned {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                all_passed = False
                continue
            
            data = response.json()
            profiles[username] = data
            
            # Test rank structure
            if not test_rank_structure(username, data):
                all_passed = False
            
        except Exception as e:
            print(f"❌ Exception for {username}: {str(e)}")
            all_passed = False
    
    # TEST 2: Rank consistency across users
    print("\n" + "=" * 80)
    print("TEST 2: Rank Consistency")
    print("=" * 80)
    
    if not test_rank_consistency(profiles):
        all_passed = False
    
    # TEST 3: Profile regression (existing fields still work)
    print("\n" + "=" * 80)
    print("TEST 3: Profile Regression")
    print("=" * 80)
    
    for username, data in profiles.items():
        if not test_profile_regression(username, data):
            all_passed = False
    
    # TEST 4: Non-existent user returns 404
    print("\n" + "=" * 80)
    print("TEST 4: Non-existent User (404)")
    print("=" * 80)
    
    print("\nTesting non-existent user...")
    try:
        response = get_user_profile("nonexistent_user_xyz")
        
        if response.status_code != 404:
            print(f"❌ Expected 404, got {response.status_code}")
            all_passed = False
        else:
            data = response.json()
            if data.get("error") == "user_not_found":
                print("✅ Non-existent user returns 404 with correct error")
            else:
                print(f"⚠️  Got 404 but unexpected error: {data}")
    except Exception as e:
        print(f"❌ Exception testing non-existent user: {str(e)}")
        all_passed = False
    
    # TEST 5: General regression - feed and login still work
    print("\n" + "=" * 80)
    print("TEST 5: General Regression (Feed & Login)")
    print("=" * 80)
    
    print("\nTesting GET /api/feed...")
    try:
        response = requests.get(f"{BASE_URL}/feed", timeout=10)
        if response.status_code == 200:
            print("✅ GET /api/feed returns 200")
        else:
            print(f"❌ GET /api/feed returned {response.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ GET /api/feed failed: {str(e)}")
        all_passed = False
    
    print("\nTesting POST /api/auth/login for all test users...")
    for user_info in TEST_USERS:
        username = user_info["username"]
        token = login(username, user_info["password"])
        if token:
            print(f"✅ Login successful for {username}")
        else:
            print(f"❌ Login failed for {username}")
            all_passed = False
    
    # SUMMARY
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    if all_passed:
        print("\n✅ ALL TESTS PASSED")
        print("\nThe Twyk Rank feature is working correctly:")
        print("  - All user profiles return valid rank objects")
        print("  - Rank structure is correct (score, rank, total, tier)")
        print("  - Ranks are mutually consistent across users")
        print("  - Existing profile fields are not affected")
        print("  - Non-existent users still return 404")
        print("  - General API endpoints still work")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED")
        print("\nPlease review the failures above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
