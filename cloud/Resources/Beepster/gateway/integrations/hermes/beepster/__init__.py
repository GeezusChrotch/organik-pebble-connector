"""Opt-in, same-user Unix socket bridge. No bot tokens or network listener.

Observe real gateway approval sessions; resolve only an exact pending request
after an explicit Beepster user decision. Hermes remains the execution owner.
"""
import json
import os
from pathlib import Path
import socket
import socketserver
import stat
import threading
import time
import asyncio
import hmac
import re
import tempfile
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def discover_sessions(home):
    """Agent-side routing metadata only; never return transcripts."""
    try:
        with sqlite3.connect((Path(home) / 'state.db').as_uri() + '?mode=ro', uri=True) as db:
            rows = db.execute("SELECT session_key, json_extract(entry_json,'$.display_name') FROM gateway_routing WHERE json_extract(entry_json,'$.platform')='telegram' AND COALESCE(json_extract(entry_json,'$.expiry_finalized'),0)=0 ORDER BY updated_at DESC LIMIT 200").fetchall()
            return [dict(provider='hermes', sessionKey=key, label=label or 'Hermes Telegram session') for key, label in rows if ':telegram:' in key]
    except (OSError, sqlite3.Error):
        try:
            data = json.loads((Path(home) / 'sessions' / 'sessions.json').read_text())
            return [dict(provider='hermes', sessionKey=key, label=item.get('display_name') or 'Hermes Telegram session')
                    for key, item in data.items() if ':telegram:' in key and item.get('platform') == 'telegram' and not item.get('expiry_finalized')][:200]
        except (OSError, ValueError, AttributeError):
            return []


def thread_prompt(session, directory=None):
    directory = Path(directory or Path.home() / 'Library' / 'Application Support' / 'Beepster')
    try:
        links = json.loads((directory / 'agent-links.json').read_text())['links']
        rows = json.loads((directory / 'thread-prompts.json').read_text())['prompts']
        link = next((l for l in links if l.get('enabled') and l.get('provider') == 'hermes' and l.get('sessionKey') == session), None)
        row = next((r for r in rows if link and r.get('provider') == 'hermes' and r.get('sessionKey') == session and r.get('chatID') == link.get('chatID')), None)
        text = row.get('text') if row else None
        return text if isinstance(text, str) and len(text) <= 12000 else ''
    except (OSError, ValueError, KeyError, TypeError):
        return ''


class ApprovalBridge:
    def __init__(self, list_pending, resolve_pending, directory, http_port=None, http_token=None, session_loader=None):
        self.list_pending = list_pending
        self.resolve_pending = resolve_pending
        self.directory = Path(directory)
        self.sessions = set()
        self.seen = {}
        self.lock = threading.RLock()
        self.server = None
        self.slash = None
        self.loop = None
        self.delivery = {}
        self.http_port = http_port
        self.http_token = http_token
        self.session_loader = session_loader or (lambda: [])
        self.synced_prompts = []
        if http_port is not None:
            if not isinstance(http_token, str) or not re.fullmatch(r'[a-fA-F0-9]{32,}', http_token):
                raise ValueError('An explicit 32+ hex bridge token is required')
            try:
                rows = json.loads((self.directory / 'store-prompts.json').read_text())
                if isinstance(rows, list) and len(rows) <= 100 and all(
                    isinstance(row, dict) and isinstance(row.get('sessionKey'), str) and ':telegram:' in row['sessionKey'] and
                    isinstance(row.get('chatID'), str) and isinstance(row.get('text'), str) and len(row['text']) <= 12000
                    for row in rows):
                    self.synced_prompts = rows
            except (OSError, ValueError):
                pass

    def observe_gateway(self, event=None, gateway=None, **unused):
        # Observe only. Authorization and command dispatch remain Hermes-owned.
        source = getattr(event, 'source', None)
        platform = getattr(source, 'platform', None)
        if getattr(platform, 'value', platform) != 'telegram' or gateway is None:
            return
        session = gateway._session_key_for_source(source)
        if ':telegram:' not in session:
            return
        # Add only this linked session's instructions to Hermes' per-turn
        # system context. No global prompt or persisted conversation is changed.
        prompt = (next((row['text'] for row in self.synced_prompts if row['sessionKey'] == session), '')
                  if self.http_port is not None else thread_prompt(session))
        if prompt.strip():
            event.channel_prompt = ((getattr(event, 'channel_prompt', None) or '') + '\n\nUser instructions for this connected thread:\n' + prompt).strip()
        self.loop = asyncio.get_running_loop()
        self.observe(session_key=session, surface='gateway')
        adapter = gateway.adapters.get(platform)
        if session in self.sessions and adapter is not None:
            self.delivery[session] = (adapter, str(source.chat_id), getattr(source, 'thread_id', None))

    def slash_item(self, session):
        if self.slash is None or self.loop is None or not self.loop.is_running():
            return None
        entry = self.slash.get_pending(session)
        descriptions = {
            'new': 'Start a fresh session and discard the current conversation history.',
            'reset': 'Reset the current conversation. Its existing history will no longer be the active conversation.',
            'clear': 'Clear the current conversation history.',
            'undo': 'Undo the last conversation turn.',
        }
        if not entry or entry.get('command') not in descriptions:
            return None  # Never invent the effect of an unknown slash command.
        created = int(float(entry.get('created_at', 0)) * 1000)
        if not created or time.time() * 1000 >= created + 300000:
            return None
        return dict(id='slash:' + str(entry['confirm_id']) + ':' + str(created),
                    sessionKey=session, kind='slash-confirm',
                    summary='Confirm /' + entry['command'] + '\n\n' + descriptions[entry['command']] +
                    '\n\nApprove once proceeds. Deny cancels and keeps the conversation.',
                    alwaysScope='Proceed now and disable confirmation for ALL future /clear, /new, /reset and /undo commands in Hermes. This changes the global destructive_slash_confirm setting.',
                    createdAt=created, expiresAt=created + 300000)

    def observe(self, session_key='', surface='', **unused):
        if surface != 'gateway' or ':telegram:' not in session_key:
            return
        with self.lock:
            if len(self.sessions) >= 100 and session_key not in self.sessions:
                return
            self.sessions.add(session_key)
            self.start()

    def items(self):
        result = []
        active = set()
        for session in self.sessions:
            slash = self.slash_item(session)
            if slash:
                result.append(slash)
            for item in self.list_pending(session):
                request_id = item.get('request_id')
                if not isinstance(request_id, str) or not request_id:
                    continue
                key = (session, request_id)
                active.add(key)
                created = self.seen.setdefault(key, int(time.time() * 1000))
                # Never silently truncate the action the user is approving.
                summary = str(item.get('description') or '') + '\n\n' + str(item.get('command') or '')
                if not summary.strip() or len(summary) > 4000:
                    continue
                result.append(dict(id=request_id, sessionKey=session, kind='exec',
                                   summary=summary.strip(), createdAt=created, expiresAt=0))
        self.seen = {key: value for key, value in self.seen.items() if key in active}
        return result[:100]

    def handle(self, body):
        with self.lock:
            if body.get('method') == 'sessions':
                entries = self.session_loader()
                known = {row['sessionKey'] for row in entries}
                entries += [dict(provider='hermes', sessionKey=key, label='Hermes Telegram session') for key in sorted(self.sessions) if key not in known]
                return dict(protocol=1, ok=True, items=entries)
            if body.get('method') == 'prompts.sync':
                if self.http_port is None:
                    raise ValueError('Prompt sync requires authenticated HTTP mode')
                rows = body.get('prompts')
                known = {r['sessionKey'] for r in self.handle(dict(method='sessions'))['items']}
                if not isinstance(rows, list) or len(rows) > 100:
                    raise ValueError('Invalid prompt list')
                seen = set()
                for row in rows:
                    if (not isinstance(row, dict) or row.get('sessionKey') not in known or
                        row.get('sessionKey') in seen or not isinstance(row.get('chatID'), str) or not row['chatID'] or
                        not isinstance(row.get('text'), str) or len(row['text']) > 12000 or '\0' in row['text']):
                        raise ValueError('Invalid linked session prompt')
                    seen.add(row['sessionKey'])
                clean = [dict(sessionKey=r['sessionKey'], chatID=r['chatID'], text=r['text']) for r in rows]
                with tempfile.NamedTemporaryFile(mode='w', dir=self.directory, delete=False) as output:
                    temp_path = Path(output.name)
                    json.dump(clean, output)
                try:
                    os.replace(temp_path, self.directory / 'store-prompts.json')
                finally:
                    temp_path.unlink(missing_ok=True)
                self.synced_prompts = clean
                return dict(protocol=1, ok=True)
            if body.get('method') == 'list':
                return dict(protocol=1, ok=True, items=self.items())
            if body.get('method') != 'resolve' or body.get('decision') not in ('allow-once', 'deny', 'allow-always'):
                raise ValueError('Only exact one-time approvals are supported')
            session, request_id = body.get('sessionKey'), body.get('id')
            if not isinstance(session, str) or session not in self.sessions or not request_id:
                raise ValueError('Unknown Telegram session')
            if not any(i['id'] == request_id and i['sessionKey'] == session for i in self.items()):
                raise ValueError('The exact approval is no longer pending')
            if request_id.startswith('slash:'):
                async def decide():
                    # Recheck on the owning event loop immediately before resolving.
                    item = self.slash_item(session)
                    if not item or item['id'] != request_id:
                        raise ValueError('Confirmation changed or expired')
                    route = self.delivery.get(session)
                    if route is None:
                        raise ValueError('Telegram confirmation route unavailable')
                    entry = self.slash.get_pending(session)
                    result = await self.slash.resolve(session, entry['confirm_id'],
                        {'allow-once': 'once', 'deny': 'cancel', 'allow-always': 'always'}[body['decision']])
                    if not isinstance(result, str) or result.startswith('❌'):
                        raise ValueError('Hermes did not confirm completion; do not retry automatically')
                    adapter, chat_id, thread_id = route
                    # The ordinary slash dispatcher returns this text to the
                    # adapter. Direct resolution must explicitly deliver it.
                    sent = await adapter.send(chat_id, result,
                        metadata={'thread_id': thread_id} if thread_id else None)
                    if not getattr(sent, 'success', False):
                        raise ValueError('Decision applied but Telegram confirmation failed; do not repeat it')
                    return dict(protocol=1, ok=True)
                future = asyncio.run_coroutine_threadsafe(decide(), self.loop)
                return future.result(timeout=3)
            if body['decision'] == 'allow-always':
                raise ValueError('Standing permission scope is unavailable for this request')
            count = self.resolve_pending(session, 'once' if body['decision'] == 'allow-once' else 'deny', request_id=request_id)
            if count != 1:
                raise ValueError('Approval was not confirmed; check Hermes')
            return dict(protocol=1, ok=True)

    def start(self):
        if self.server:
            return
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Beepster bridge directory must be private and owned by this user')
        if self.http_port is not None:
            bridge = self
            class Handler(BaseHTTPRequestHandler):
                def log_message(self, *args):
                    pass  # Never log authorization or conversation data.

                def do_POST(self):
                    self.connection.settimeout(4)
                    result = dict(protocol=1, ok=False, error='Request rejected')
                    status = 400
                    try:
                        expected_host = '127.0.0.1:' + str(self.server.server_port)
                        if self.path != '/v1/beepster' or self.headers.get('Host') != expected_host or self.headers.get('Origin') is not None:
                            status = 403
                        elif not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + bridge.http_token):
                            status = 401
                        elif self.headers.get('Transfer-Encoding') is not None:
                            status = 400
                        else:
                            size = int(self.headers.get('Content-Length', '0'))
                            if size < 1 or size > 5 * 1024 * 1024:
                                status = 413
                            else:
                                raw = self.rfile.read(size)
                                if len(raw) != size:
                                    raise ValueError('Incomplete body')
                                result = bridge.handle(json.loads(raw))
                                status = 200
                    except Exception:
                        pass
                    payload = json.dumps(result).encode()
                    if len(payload) > 128000:
                        status = 413
                        payload = b'{"protocol":1,"ok":false}'
                    self.send_response(status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(payload)))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(payload)
            self.server = ThreadingHTTPServer(('127.0.0.1', self.http_port), Handler)
            self.server.daemon_threads = True
            threading.Thread(target=self.server.serve_forever, daemon=True, name='beepster-http').start()
            return
        sockpath = self.directory / 'approvals.sock'
        if sockpath.exists():
            info = sockpath.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
                raise ValueError('Unsafe bridge socket path')
            with socket.socket(socket.AF_UNIX) as probe:
                probe.settimeout(0.2)
                try:
                    probe.connect(str(sockpath))
                except ConnectionRefusedError:
                    sockpath.unlink()  # only a verified stale same-user socket
                else:
                    raise ValueError('Another Hermes process owns the Beepster bridge')
        bridge = self

        class Handler(socketserver.StreamRequestHandler):
            def handle(self):
                self.connection.settimeout(4)
                try:
                    raw = self.rfile.readline(16385)
                    if len(raw) > 16384 or not raw.endswith(b'\n'):
                        raise ValueError('Invalid request')
                    result = bridge.handle(json.loads(raw))
                except Exception:
                    result = dict(protocol=1, ok=False, error='Exact approval unavailable or unsupported request')
                self.wfile.write((json.dumps(result) + '\n').encode())

        class Server(socketserver.ThreadingUnixStreamServer):
            daemon_threads = True

        self.server = Server(str(sockpath), Handler)
        os.chmod(sockpath, 0o600)
        threading.Thread(target=self.server.serve_forever, daemon=True, name='beepster-approvals').start()

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            if self.http_port is None:
                (self.directory / 'approvals.sock').unlink(missing_ok=True)
            self.server = None


def register(ctx):
    # Capability detection, not a hard-coded user path or a Hermes version guess.
    import inspect
    from tools.approval import list_gateway_approvals, resolve_gateway_approval
    if 'request_id' not in inspect.signature(resolve_gateway_approval).parameters:
        raise RuntimeError('Update Hermes: exact-request approvals are required by Beepster')
    from hermes_constants import get_hermes_home
    port = os.environ.get('BEEPSTER_HERMES_BRIDGE_PORT')
    if port is not None and (not port.isdigit() or not 1024 <= int(port) <= 65535):
        raise ValueError('Hermes bridge port must be between 1024 and 65535')
    bridge = ApprovalBridge(list_gateway_approvals, resolve_gateway_approval,
                            Path(get_hermes_home()) / 'beepster',
                            http_port=int(port) if port else None,
                            http_token=os.environ.get('BEEPSTER_HERMES_BRIDGE_TOKEN'),
                            session_loader=lambda: discover_sessions(get_hermes_home()))
    from tools import slash_confirm
    bridge.slash = slash_confirm
    ctx.register_hook('pre_approval_request', bridge.observe)
    ctx.register_hook('pre_gateway_dispatch', bridge.observe_gateway)
    ctx.on_unload(bridge.stop)
    if port:
        bridge.start()
