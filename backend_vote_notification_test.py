#!/usr/bin/env python3
"""
Test script for VOTE notification bug fix in Twyk app.
Tests that voting on uploaded posts (versus/duet stored in _meta.json) creates notifications.
"""

import requests
import json
import io
import random
import string

# Backend base URL (internal)
BASE_URL = "http://localhost:3000/api"

def random_string(length=8):
    """Generate random string for unique usernames"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def create_dummy_mp4():
    """Create minimal valid MP4 bytes for testing"""
    # Minimal MP4 with ftyp and mdat atoms
    ftyp = b'\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6f\x6d\x00\x00\x02\x00'
    ftyp += b'\x69\x73\x6f\x6d\x69\x73\x6f\x32\x6d\x70\x34\x31\x00\x00\x00\x08'
    mdat = b'\x6d\x64\x61\x74'
    return ftyp + mdat

def register_user(username, email, password):
    """Register a new user and return session info"""
    print(f"\n[REGISTER] Registering user: {username}")
    
    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "username": username,
            "email": email,
            "password": password
        }
    )
    
    print(f"[REGISTER] Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"[REGISTER] ❌ FAILED: {response.text}")
        return None
    
    data = response.json()
    token = data.get('token')
    session_cookie = response.cookies.get('session_token')
    
    print(f"[REGISTER] ✅ SUCCESS: User {username} registered")
    print(f"[REGISTER] Token: {token[:20]}..." if token else "[REGISTER] No token")
    print(f"[REGISTER] Cookie: {session_cookie[:20]}..." if session_cookie else "[REGISTER] No cookie")
    
    # Create session object to persist cookies
    session = requests.Session()
    if session_cookie:
        session.cookies.set('session_token', session_cookie)
    
    return {
        'username': username,
        'token': token,
        'session': session,
        'user': data.get('user')
    }

def post_versus(session_info, description="Test versus"):
    """Upload a versus post with two video files"""
    print(f"\n[VERSUS] Uploading versus post as {session_info['username']}")
    
    # Create dummy MP4 files
    fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
    fileB = ('videoB.mp4', create_dummy_mp4(), 'video/mp4')
    
    files = {
        'fileA': fileA,
        'fileB': fileB
    }
    data = {
        'description': description
    }
    
    # Use session to persist cookies
    response = session_info['session'].post(
        f"{BASE_URL}/versus",
        files=files,
        data=data
    )
    
    print(f"[VERSUS] Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"[VERSUS] ❌ FAILED: {response.text}")
        return None
    
    result = response.json()
    post = result.get('post')
    
    if not post:
        print(f"[VERSUS] ❌ FAILED: No post in response")
        return None
    
    post_id = post.get('id')
    author_username = post.get('author', {}).get('username')
    
    print(f"[VERSUS] ✅ SUCCESS: Post created")
    print(f"[VERSUS] Post ID: {post_id}")
    print(f"[VERSUS] Author: {author_username}")
    print(f"[VERSUS] Type: {post.get('type')}")
    
    # Verify post ID starts with 'versus_up_'
    if not post_id.startswith('versus_up_'):
        print(f"[VERSUS] ⚠️  WARNING: Post ID doesn't start with 'versus_up_': {post_id}")
    
    # Verify author matches
    if author_username != session_info['username']:
        print(f"[VERSUS] ❌ FAILED: Author mismatch. Expected {session_info['username']}, got {author_username}")
        return None
    
    return post

def post_duet(session_info, description="Test duet", layout="horizontal"):
    """Upload a duet post with two video files"""
    print(f"\n[DUET] Uploading duet post as {session_info['username']}")
    
    # Create dummy MP4 files
    fileA = ('videoA.mp4', create_dummy_mp4(), 'video/mp4')
    fileB = ('videoB.mp4', create_dummy_mp4(), 'video/mp4')
    
    files = {
        'fileA': fileA,
        'fileB': fileB
    }
    data = {
        'description': description,
        'layout': layout
    }
    
    # Use session to persist cookies
    response = session_info['session'].post(
        f"{BASE_URL}/duet",
        files=files,
        data=data
    )
    
    print(f"[DUET] Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"[DUET] ❌ FAILED: {response.text}")
        return None
    
    result = response.json()
    post = result.get('post')
    
    if not post:
        print(f"[DUET] ❌ FAILED: No post in response")
        return None
    
    post_id = post.get('id')
    author_username = post.get('author', {}).get('username')
    
    print(f"[DUET] ✅ SUCCESS: Post created")
    print(f"[DUET] Post ID: {post_id}")
    print(f"[DUET] Author: {author_username}")
    print(f"[DUET] Type: {post.get('type')}")
    print(f"[DUET] Layout: {post.get('layout')}")
    
    # Verify author matches
    if author_username != session_info['username']:
        print(f"[DUET] ❌ FAILED: Author mismatch. Expected {session_info['username']}, got {author_username}")
        return None
    
    return post

def vote_on_post(session_info, post_id, side):
    """Vote on a post"""
    print(f"\n[VOTE] Voting on post {post_id} as {session_info['username']} (side: {side})")
    
    response = session_info['session'].post(
        f"{BASE_URL}/vote",
        json={
            "id": post_id,
            "side": side
        }
    )
    
    print(f"[VOTE] Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"[VOTE] ❌ FAILED: {response.text}")
        return None
    
    result = response.json()
    votes = result.get('votes')
    
    print(f"[VOTE] ✅ SUCCESS: Vote recorded")
    print(f"[VOTE] Votes: {votes}")
    
    return result

def get_notifications(session_info):
    """Get all notifications for user"""
    print(f"\n[NOTIFICATIONS] Getting notifications for {session_info['username']}")
    
    response = session_info['session'].get(f"{BASE_URL}/notifications")
    
    print(f"[NOTIFICATIONS] Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"[NOTIFICATIONS] ❌ FAILED: {response.text}")
        return None
    
    result = response.json()
    notifications = result.get('notifications', [])
    
    print(f"[NOTIFICATIONS] ✅ SUCCESS: Retrieved {len(notifications)} notifications")
    
    for i, notif in enumerate(notifications):
        print(f"[NOTIFICATIONS] [{i}] Type: {notif.get('type')}, User: {notif.get('user', {}).get('username')}, Side: {notif.get('side')}, PostId: {notif.get('postId')}")
    
    return notifications

def get_unread_count(session_info):
    """Get unread notifications count"""
    print(f"\n[UNREAD] Getting unread count for {session_info['username']}")
    
    response = session_info['session'].get(f"{BASE_URL}/notifications/unread")
    
    print(f"[UNREAD] Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"[UNREAD] ❌ FAILED: {response.text}")
        return None
    
    result = response.json()
    count = result.get('count', 0)
    
    print(f"[UNREAD] ✅ SUCCESS: Unread count = {count}")
    
    return count

def main():
    """Main test flow"""
    print("=" * 80)
    print("VOTE NOTIFICATION BUG FIX TEST")
    print("=" * 80)
    
    # Generate unique usernames
    rand_suffix = random_string(6)
    autor_username = f"autorA_{rand_suffix}"
    votante_username = f"votanteB_{rand_suffix}"
    
    # (A) Register two users
    print("\n" + "=" * 80)
    print("SCENARIO A: Register two users")
    print("=" * 80)
    
    autor = register_user(
        username=autor_username,
        email=f"{autor_username}@test.com",
        password="password123"
    )
    
    if not autor:
        print("\n❌ TEST FAILED: Could not register autorA")
        return
    
    votante = register_user(
        username=votante_username,
        email=f"{votante_username}@test.com",
        password="password123"
    )
    
    if not votante:
        print("\n❌ TEST FAILED: Could not register votanteB")
        return
    
    print("\n✅ SCENARIO A PASSED: Both users registered successfully")
    
    # (B) As autorA: POST /api/versus
    print("\n" + "=" * 80)
    print("SCENARIO B: AutorA uploads versus post")
    print("=" * 80)
    
    versus_post = post_versus(autor, description="¿Cuál prefieres? Test")
    
    if not versus_post:
        print("\n❌ TEST FAILED: Could not create versus post")
        return
    
    versus_post_id = versus_post.get('id')
    print(f"\n✅ SCENARIO B PASSED: Versus post created with ID {versus_post_id}")
    
    # (C) As votanteB: POST /api/vote
    print("\n" + "=" * 80)
    print("SCENARIO C: VotanteB votes on autorA's post")
    print("=" * 80)
    
    vote_result = vote_on_post(votante, versus_post_id, 'a')
    
    if not vote_result:
        print("\n❌ TEST FAILED: Could not vote on post")
        return
    
    votes = vote_result.get('votes')
    if votes.get('a') != 1 or votes.get('b') != 0:
        print(f"\n❌ SCENARIO C FAILED: Expected votes {{a:1, b:0}}, got {votes}")
        return
    
    print(f"\n✅ SCENARIO C PASSED: Vote recorded successfully")
    
    # (D) As autorA: GET /api/notifications - must have vote notification
    print("\n" + "=" * 80)
    print("SCENARIO D: AutorA checks notifications (must have vote notification)")
    print("=" * 80)
    
    notifications = get_notifications(autor)
    
    if notifications is None:
        print("\n❌ TEST FAILED: Could not get notifications")
        return
    
    # Find vote notification from votanteB for this post
    vote_notif = None
    for notif in notifications:
        if (notif.get('type') == 'vote' and 
            notif.get('user', {}).get('username') == votante_username and
            notif.get('postId') == versus_post_id and
            notif.get('side') == 'a'):
            vote_notif = notif
            break
    
    if not vote_notif:
        print(f"\n❌ SCENARIO D FAILED: No vote notification found")
        print(f"Expected: type='vote', user.username='{votante_username}', postId='{versus_post_id}', side='a'")
        print(f"Got {len(notifications)} notifications:")
        for notif in notifications:
            print(f"  - Type: {notif.get('type')}, User: {notif.get('user', {}).get('username')}, PostId: {notif.get('postId')}, Side: {notif.get('side')}")
        return
    
    print(f"\n✅ SCENARIO D PASSED: Vote notification found!")
    print(f"   Type: {vote_notif.get('type')}")
    print(f"   From: {vote_notif.get('user', {}).get('username')}")
    print(f"   Side: {vote_notif.get('side')}")
    print(f"   PostId: {vote_notif.get('postId')}")
    
    # (E) As autorA: GET /api/notifications/unread - count >= 1
    print("\n" + "=" * 80)
    print("SCENARIO E: AutorA checks unread count (must be >= 1)")
    print("=" * 80)
    
    unread_count = get_unread_count(autor)
    
    if unread_count is None:
        print("\n❌ TEST FAILED: Could not get unread count")
        return
    
    if unread_count < 1:
        print(f"\n❌ SCENARIO E FAILED: Expected unread count >= 1, got {unread_count}")
        return
    
    print(f"\n✅ SCENARIO E PASSED: Unread count = {unread_count} (>= 1)")
    
    # (F) Self-notification check: autorA votes on own post
    print("\n" + "=" * 80)
    print("SCENARIO F: Self-notification check (autorA votes on own post)")
    print("=" * 80)
    
    # Get current unread count
    count_before = get_unread_count(autor)
    print(f"[SELF-VOTE] Unread count before self-vote: {count_before}")
    
    # AutorA votes on their own post
    self_vote_result = vote_on_post(autor, versus_post_id, 'b')
    
    if not self_vote_result:
        print("\n❌ TEST FAILED: Could not self-vote on post")
        return
    
    # Get unread count after self-vote
    count_after = get_unread_count(autor)
    print(f"[SELF-VOTE] Unread count after self-vote: {count_after}")
    
    if count_after > count_before:
        print(f"\n❌ SCENARIO F FAILED: Unread count increased from {count_before} to {count_after}")
        print("Self-notification was created (should not happen)")
        return
    
    print(f"\n✅ SCENARIO F PASSED: Unread count did not increase ({count_before} -> {count_after})")
    print("No self-notification created ✓")
    
    # (G) Repeat with duet post
    print("\n" + "=" * 80)
    print("SCENARIO G: Repeat with duet post")
    print("=" * 80)
    
    # AutorA creates duet post
    duet_post = post_duet(autor, description="Test duet 1vs1", layout="horizontal")
    
    if not duet_post:
        print("\n❌ TEST FAILED: Could not create duet post")
        return
    
    duet_post_id = duet_post.get('id')
    print(f"\n[DUET TEST] Duet post created with ID {duet_post_id}")
    
    # VotanteB votes on duet post
    duet_vote_result = vote_on_post(votante, duet_post_id, 'b')
    
    if not duet_vote_result:
        print("\n❌ TEST FAILED: Could not vote on duet post")
        return
    
    # AutorA checks notifications
    duet_notifications = get_notifications(autor)
    
    if duet_notifications is None:
        print("\n❌ TEST FAILED: Could not get notifications after duet vote")
        return
    
    # Find vote notification for duet post
    duet_vote_notif = None
    for notif in duet_notifications:
        if (notif.get('type') == 'vote' and 
            notif.get('user', {}).get('username') == votante_username and
            notif.get('postId') == duet_post_id and
            notif.get('side') == 'b'):
            duet_vote_notif = notif
            break
    
    if not duet_vote_notif:
        print(f"\n❌ SCENARIO G FAILED: No vote notification found for duet post")
        print(f"Expected: type='vote', user.username='{votante_username}', postId='{duet_post_id}', side='b'")
        return
    
    print(f"\n✅ SCENARIO G PASSED: Vote notification found for duet post!")
    print(f"   Type: {duet_vote_notif.get('type')}")
    print(f"   From: {duet_vote_notif.get('user', {}).get('username')}")
    print(f"   Side: {duet_vote_notif.get('side')}")
    print(f"   PostId: {duet_vote_notif.get('postId')}")
    
    # Final summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print("✅ SCENARIO A: User registration - PASSED")
    print("✅ SCENARIO B: Versus post upload - PASSED")
    print("✅ SCENARIO C: Vote on versus post - PASSED")
    print("✅ SCENARIO D: Vote notification created - PASSED")
    print("✅ SCENARIO E: Unread count >= 1 - PASSED")
    print("✅ SCENARIO F: No self-notification - PASSED")
    print("✅ SCENARIO G: Duet post vote notification - PASSED")
    print("\n🎉 ALL TESTS PASSED!")
    print("=" * 80)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ TEST FAILED WITH EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
