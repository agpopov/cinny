"""Deterministic Matrix HTTP responses for packaged-session startup acceptance.

Only the homeserver is a fixture. The app's session handling, IndexedDB migration,
Matrix SDK, Rust crypto/WASM, sync and room rendering run without replacements.
"""
import json
import time
from urllib.parse import unquote, urlsplit

HS = 'https://session.cinny.test'
USER = '@startup:session.cinny.test'
ROOM = '!startup:session.cinny.test'
SPACE = '!workspace:session.cinny.test'
CHANNEL = '!channel:session.cinny.test'
DIRECT = '!direct:session.cinny.test'
PEER = '@peer:session.cinny.test'
ALIAS = '#startup:session.cinny.test'
TOKEN = 'disposable-startup-token'
DEVICE = 'STARTUPDEVICE'
MESSAGE = 'Saved session restored with real Matrix SDK and Rust crypto'


def install_session_fixture(page, hash_router=True):
    requests = []
    device_keys = {}
    sync_count = 0
    now = int(time.time() * 1000)

    def event(kind, content, state_key=None, index=0):
        value = {'type': kind, 'content': content, 'sender': USER,
                 'event_id': '$startup' + str(index), 'origin_server_ts': now + index}
        if state_key is not None:
            value['state_key'] = state_key
        return value

    state = [event('m.room.create', {'creator': USER, 'room_version': '10'}, '', 1),
             event('m.room.member', {'membership': 'join', 'displayname': 'Startup user'}, USER, 2),
             event('m.room.name', {'name': 'Saved session startup'}, '', 3),
             event('m.room.power_levels', {'users': {USER: 100}, 'users_default': 0,
                                          'events_default': 0, 'state_default': 50}, '', 4)]
    message = event('m.room.message', {'msgtype': 'm.text', 'body': MESSAGE}, index=5)

    def joined_room(room_state, events):
        return {'state': {'events': room_state},
                'timeline': {'events': events, 'prev_batch': 'startup-before', 'limited': False},
                'ephemeral': {'events': []}, 'account_data': {'events': []},
                'unread_notifications': {'notification_count': 0, 'highlight_count': 0}}

    def other_state(key, name, extra=None):
        result = json.loads(json.dumps(state))
        for index, item in enumerate(result):
            item['event_id'] = '$' + key + str(index)
            if item['type'] == 'm.room.name': item['content'] = {'name': name}
        return result + (extra or [])

    space_state = other_state('space', 'Saved session workspace', [
        event('m.space.child', {'via': ['session.cinny.test']}, CHANNEL, 10)])
    space_state[0]['content']['type'] = 'm.space'
    channel_state = other_state('channel', 'Workspace channel', [
        event('m.space.parent', {'via': ['session.cinny.test'], 'canonical': True}, SPACE, 11)])
    channel_message = event('m.room.message', {'msgtype': 'm.text', 'body': 'Workspace channel is open'}, index=12)
    direct_state = other_state('direct', 'Saved direct conversation', [
        event('m.room.member', {'membership': 'join', 'displayname': 'Startup peer'}, PEER, 13)])
    direct_message = event('m.room.message', {'msgtype': 'm.text', 'body': 'Direct conversation is open'}, index=14)
    state.append(event('m.room.canonical_alias', {'alias': ALIAS}, '', 15))
    joined = {ROOM: joined_room(state, [message]),
              SPACE: joined_room(space_state, []),
              CHANNEL: joined_room(channel_state, [channel_message]),
              DIRECT: joined_room(direct_state, [direct_message])}

    def respond(route):
        nonlocal sync_count
        request = route.request
        path = unquote(urlsplit(request.url).path)
        requests.append({'method': request.method, 'path': path})
        status = 200
        if path == '/.well-known/matrix/client':
            body = {'m.homeserver': {'base_url': HS}}
        elif path == '/_matrix/client/versions':
            body = {'versions': ['v1.1', 'v1.11'], 'unstable_features': {}}
        elif path.endswith('/login'):
            body = ({'flows': [{'type': 'm.login.password'}]} if request.method == 'GET' else
                    {'access_token': TOKEN, 'device_id': DEVICE, 'user_id': USER, 'home_server': 'session.cinny.test'})
        elif path.endswith('/auth_metadata'):
            status, body = 404, {'errcode': 'M_UNRECOGNIZED', 'error': 'OIDC not enabled'}
        elif path.endswith('/capabilities'):
            body = {'capabilities': {}}
        elif path.rstrip('/').endswith('/pushrules'):
            body = {'global': {kind: [] for kind in ['override', 'content', 'room', 'sender', 'underride']}}
        elif path.endswith('/voip/turnServer'):
            body = {'uris': [], 'username': '', 'password': '', 'ttl': 86400}
        elif path.endswith('/filter'):
            body = {'filter_id': 'startup-filter'}
        elif '/filter/' in path:
            body = {}
        elif '/media/' in path and path.endswith('/config'):
            body = {'m.upload.size': 52428800}
        elif path.endswith('/account/whoami'):
            body = {'user_id': USER, 'device_id': DEVICE}
        elif path.endswith('/keys/upload'):
            uploaded = request.post_data_json or {}
            if uploaded.get('device_keys'):
                device_keys[DEVICE] = uploaded['device_keys']
            body = {'one_time_key_counts': {'signed_curve25519': 50}}
        elif path.endswith('/keys/query'):
            body = {'device_keys': {USER: device_keys}, 'failures': {}}
        elif path.endswith('/keys/claim'):
            body = {'one_time_keys': {}, 'failures': {}}
        elif path.endswith('/room_keys/version'):
            status, body = 404, {'errcode': 'M_NOT_FOUND', 'error': 'No key backup'}
        elif path.endswith('/sync'):
            sync_count += 1
            # A short delay keeps the SDK's long-poll loop bounded in a fixture.
            time.sleep(0.15)
            body = {'next_batch': 'startup-' + str(sync_count),
                    'rooms': {'join': joined},
                    'account_data': {'events': [{'type': 'm.push_rules', 'content': {'global': {}}}, {'type': 'm.direct', 'content': {PEER: [DIRECT]}}]},
                    'presence': {'events': []}, 'to_device': {'events': []},
                    'device_lists': {'changed': [], 'left': []},
                    'device_one_time_keys_count': {'signed_curve25519': 50},
                    'device_unused_fallback_key_types': ['signed_curve25519']}
        elif path.endswith('/joined_members'):
            body = {'joined': {USER: {'display_name': 'Startup user', 'avatar_url': None}}}
        elif path.endswith('/members'):
            body = {'chunk': [state[1]]}
        elif path.endswith('/messages'):
            body = {'start': 'startup-before', 'end': 'startup-before', 'chunk': []}
        elif path.endswith('/threads'):
            body = {'chunk': []}
        elif path.endswith('/relations'):
            body = {'chunk': []}
        elif path.endswith('/hierarchy'):
            body = {'rooms': []}
        elif path.endswith('/devices'):
            body = {'devices': [{'device_id': DEVICE, 'display_name': 'Startup test device'}]}
        elif '/account_data/' in path:
            if request.method == 'GET':
                status, body = 404, {'errcode': 'M_NOT_FOUND', 'error': 'No account data'}
            else:
                body = {}
        elif '/profile/' in path:
            body = {'displayname': 'Startup user', 'avatar_url': None}
        elif '/sendToDevice/' in path or '/receipt/' in path or path.endswith('/read_markers'):
            body = {}
        else:
            status, body = 404, {'errcode': 'M_UNRECOGNIZED', 'error': 'Fixture endpoint unavailable'}
        route.fulfill(status=status, json=body, headers={'Access-Control-Allow-Origin': '*'})

    page.route(HS + '/**', respond)
    page.route('**/config.json', lambda route: route.fulfill(json={
        'homeserverList': [HS], 'allowCustomHomeservers': False,
        'hashRouter': {'enabled': hash_router, 'basename': '/'},
    }))
    return requests


def seed_session(page):
    page.evaluate('s => {for (const [key,value] of Object.entries(s)) localStorage.setItem(key,value)}', {
        'cinny_access_token': TOKEN, 'cinny_device_id': DEVICE,
        'cinny_user_id': USER, 'cinny_hs_base_url': HS,
        'settings': json.dumps({'isNotificationSounds': False, 'showNotifications': False}),
    })


def assert_session_ready(page):
    from playwright.sync_api import expect
    expect(page.locator('[data-editable-name="RoomInput"]')).to_have_attribute('contenteditable', 'true', timeout=60000)
    expect(page.get_by_text(MESSAGE, exact=True)).to_be_visible(timeout=30000)
    assert page.evaluate('typeof global') == 'undefined', 'Startup must work without a Node global alias'
    assert page.evaluate('localStorage.getItem("cinny_sync_store_schema")') == 'threads-v1'
    assert 'Failed to load.' not in page.locator('body').inner_text()
    assert 'Failed to start.' not in page.locator('body').inner_text()
