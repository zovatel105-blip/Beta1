#!/usr/bin/env python3
"""
Backend test for regional Trending Challenge theme consistency bug fix.

Tests that GET /api/luxury-battles/active, GET /api/luxury-battles/leaderboard (no themeId),
and GET /api/luxury-battles/posts (no themeId) all return the SAME theme for the same visitor IP.
"""

import os
import requests
import json
from typing import Dict, Any, Optional

# Read base URL from .env
BASE_URL = None
with open('/app/.env', 'r') as f:
    for line in f:
        if line.startswith('NEXT_PUBLIC_BASE_URL='):
            BASE_URL = line.split('=', 1)[1].strip()
            break

if not BASE_URL:
    raise Exception("NEXT_PUBLIC_BASE_URL not found in .env")

API_BASE = f"{BASE_URL}/api"

# Test IPs from different countries
TEST_IPS = {
    '8.8.8.8': 'US',
    '82.223.0.1': 'ES',
    '200.160.2.3': 'BR',
}

def test_regional_theme_consistency():
    """
    Core regression test: verify all 3 endpoints return the SAME theme for the same IP.
    """
    print("\n" + "="*80)
    print("TEST 1: Regional Theme Consistency Across Endpoints")
    print("="*80)
    
    all_passed = True
    
    for ip, expected_country in TEST_IPS.items():
        print(f"\n--- Testing IP: {ip} (expected country: {expected_country}) ---")
        
        headers = {'X-Forwarded-For': ip}
        
        try:
            # Call all 3 endpoints with the same IP
            r1 = requests.get(f"{API_BASE}/luxury-battles/active", headers=headers, timeout=10)
            r2 = requests.get(f"{API_BASE}/luxury-battles/leaderboard", headers=headers, timeout=10)
            r3 = requests.get(f"{API_BASE}/luxury-battles/posts", headers=headers, timeout=10)
            
            print(f"  /active status: {r1.status_code}")
            print(f"  /leaderboard status: {r2.status_code}")
            print(f"  /posts status: {r3.status_code}")
            
            if r1.status_code != 200 or r2.status_code != 200 or r3.status_code != 200:
                print(f"  ❌ FAIL: One or more endpoints returned non-200 status")
                all_passed = False
                continue
            
            data1 = r1.json()
            data2 = r2.json()
            data3 = r3.json()
            
            theme1 = data1.get('theme')
            theme2 = data2.get('theme')
            theme3 = data3.get('theme')
            
            if not theme1 or not theme2 or not theme3:
                print(f"  ❌ FAIL: One or more endpoints returned null theme")
                print(f"    /active theme: {theme1}")
                print(f"    /leaderboard theme: {theme2}")
                print(f"    /posts theme: {theme3}")
                all_passed = False
                continue
            
            theme1_id = theme1.get('id')
            theme1_title = theme1.get('title')
            theme2_id = theme2.get('id')
            theme2_title = theme2.get('title')
            theme3_id = theme3.get('id')
            theme3_title = theme3.get('title')
            
            print(f"  /active theme: id={theme1_id}, title='{theme1_title}'")
            print(f"  /leaderboard theme: id={theme2_id}, title='{theme2_title}'")
            print(f"  /posts theme: id={theme3_id}, title='{theme3_title}'")
            
            # Check if all theme IDs match
            if theme1_id == theme2_id == theme3_id:
                print(f"  ✅ PASS: All 3 endpoints returned the SAME theme (id={theme1_id})")
                
                # Also verify titles match
                if theme1_title == theme2_title == theme3_title:
                    print(f"  ✅ PASS: Theme titles also match ('{theme1_title}')")
                else:
                    print(f"  ⚠️  WARNING: Theme IDs match but titles differ (should not happen)")
                    all_passed = False
            else:
                print(f"  ❌ FAIL: Theme IDs DO NOT MATCH across endpoints!")
                print(f"    This is the BUG that was supposed to be fixed.")
                all_passed = False
            
            # Check region field from /active
            region = data1.get('region')
            print(f"  Region detected: {region}")
            
        except Exception as e:
            print(f"  ❌ FAIL: Exception occurred: {e}")
            all_passed = False
    
    return all_passed


def test_explicit_theme_id():
    """
    Test that explicit themeId parameter overrides regional logic.
    """
    print("\n" + "="*80)
    print("TEST 2: Explicit themeId Parameter Override")
    print("="*80)
    
    try:
        # First, get the current active/regional theme for US
        headers = {'X-Forwarded-For': '8.8.8.8'}
        r = requests.get(f"{API_BASE}/luxury-battles/active", headers=headers, timeout=10)
        
        if r.status_code != 200:
            print(f"❌ FAIL: Could not get active theme (status {r.status_code})")
            return False
        
        active_theme = r.json().get('theme')
        if not active_theme:
            print(f"❌ FAIL: No active theme available")
            return False
        
        active_theme_id = active_theme.get('id')
        print(f"\nActive theme for US IP: id={active_theme_id}, title='{active_theme.get('title')}'")
        
        # Now try to get leaderboard with explicit themeId (use the same ID)
        r2 = requests.get(f"{API_BASE}/luxury-battles/leaderboard?themeId={active_theme_id}", headers=headers, timeout=10)
        
        if r2.status_code != 200:
            print(f"❌ FAIL: /leaderboard with explicit themeId returned status {r2.status_code}")
            return False
        
        data2 = r2.json()
        theme2 = data2.get('theme')
        
        if not theme2:
            print(f"❌ FAIL: /leaderboard with explicit themeId returned null theme")
            return False
        
        theme2_id = theme2.get('id')
        print(f"/leaderboard with themeId={active_theme_id}: returned theme id={theme2_id}")
        
        if theme2_id == active_theme_id:
            print(f"✅ PASS: Explicit themeId parameter works correctly")
            return True
        else:
            print(f"❌ FAIL: Explicit themeId did not return the requested theme")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception occurred: {e}")
        return False


def test_no_ip_fallback():
    """
    Test that requests with NO X-Forwarded-For header fall back to global theme consistently.
    """
    print("\n" + "="*80)
    print("TEST 3: No IP Header - Fallback to Global Theme")
    print("="*80)
    
    try:
        # Call all 3 endpoints WITHOUT any IP header
        r1 = requests.get(f"{API_BASE}/luxury-battles/active", timeout=10)
        r2 = requests.get(f"{API_BASE}/luxury-battles/leaderboard", timeout=10)
        r3 = requests.get(f"{API_BASE}/luxury-battles/posts", timeout=10)
        
        print(f"/active status: {r1.status_code}")
        print(f"/leaderboard status: {r2.status_code}")
        print(f"/posts status: {r3.status_code}")
        
        if r1.status_code != 200 or r2.status_code != 200 or r3.status_code != 200:
            print(f"❌ FAIL: One or more endpoints returned non-200 status")
            return False
        
        data1 = r1.json()
        data2 = r2.json()
        data3 = r3.json()
        
        theme1 = data1.get('theme')
        theme2 = data2.get('theme')
        theme3 = data3.get('theme')
        
        # It's OK if theme is null (no global theme configured), but all 3 should be consistent
        if theme1 is None and theme2 is None and theme3 is None:
            print("✅ PASS: All 3 endpoints consistently returned null (no global theme configured)")
            return True
        
        if not theme1 or not theme2 or not theme3:
            print(f"❌ FAIL: Inconsistent null themes across endpoints")
            print(f"  /active theme: {theme1}")
            print(f"  /leaderboard theme: {theme2}")
            print(f"  /posts theme: {theme3}")
            return False
        
        theme1_id = theme1.get('id')
        theme2_id = theme2.get('id')
        theme3_id = theme3.get('id')
        
        print(f"/active theme: id={theme1_id}, title='{theme1.get('title')}'")
        print(f"/leaderboard theme: id={theme2_id}, title='{theme2.get('title')}'")
        print(f"/posts theme: id={theme3_id}, title='{theme3.get('title')}'")
        
        region = data1.get('region')
        print(f"Region detected: {region} (should be null)")
        
        if theme1_id == theme2_id == theme3_id:
            print(f"✅ PASS: All 3 endpoints returned the SAME global fallback theme (id={theme1_id})")
            return True
        else:
            print(f"❌ FAIL: Theme IDs DO NOT MATCH in fallback scenario")
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Exception occurred: {e}")
        return False


def test_smoke_regression():
    """
    Smoke test of other core endpoints to ensure nothing else broke.
    """
    print("\n" + "="*80)
    print("TEST 4: Smoke Test - Core Endpoints Regression")
    print("="*80)
    
    all_passed = True
    
    # Test 1: Login
    print("\n--- POST /api/auth/login ---")
    try:
        r = requests.post(f"{API_BASE}/auth/login", 
                         json={'username': 'lucia', 'password': 'Test12345'},
                         timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            if data.get('ok') and data.get('user'):
                print(f"✅ PASS: Login successful, user={data['user'].get('username')}")
                session_token = data.get('token')
            else:
                print(f"❌ FAIL: Login response missing expected fields")
                all_passed = False
                session_token = None
        else:
            print(f"❌ FAIL: Login failed with status {r.status_code}")
            all_passed = False
            session_token = None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        all_passed = False
        session_token = None
    
    # Test 2: Feed
    print("\n--- GET /api/feed ---")
    try:
        r = requests.get(f"{API_BASE}/feed?cursor=0&limit=5", timeout=10)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            posts = data.get('posts', [])
            print(f"✅ PASS: Feed returned {len(posts)} posts")
        else:
            print(f"❌ FAIL: Feed returned status {r.status_code}")
            all_passed = False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        all_passed = False
    
    # Test 3: Uploads (requires auth)
    if session_token:
        print("\n--- GET /api/uploads ---")
        try:
            headers = {'Authorization': f'Bearer {session_token}'}
            r = requests.get(f"{API_BASE}/uploads", headers=headers, timeout=10)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                posts = data.get('posts', [])
                print(f"✅ PASS: Uploads returned {len(posts)} posts")
            else:
                print(f"❌ FAIL: Uploads returned status {r.status_code}")
                all_passed = False
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            all_passed = False
    
    return all_passed


def main():
    print("\n" + "="*80)
    print("BACKEND TEST: Regional Trending Challenge Theme Consistency")
    print("="*80)
    print(f"API Base URL: {API_BASE}")
    
    results = {}
    
    # Run all tests
    results['regional_consistency'] = test_regional_theme_consistency()
    results['explicit_theme_id'] = test_explicit_theme_id()
    results['no_ip_fallback'] = test_no_ip_fallback()
    results['smoke_regression'] = test_smoke_regression()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*80)
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("="*80 + "\n")
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    exit(main())
