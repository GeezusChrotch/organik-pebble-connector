import importlib.util
from pathlib import Path
import tempfile
import unittest
import socket
import json
import sys
import asyncio
import threading
import time
import http.client
from types import SimpleNamespace
sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'integrations/hermes/beepster/__init__.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BridgeTest(unittest.TestCase):
    def test_http_auth_sessions_prompt_sync_and_exact_decision(self):
        session = 'agent:main:telegram:dm:123'
        pending = [dict(request_id='one', command='echo test')]
        decisions = []
        def resolve(key, choice, request_id):
            decisions.append((key, choice, request_id)); pending.clear(); return 1
        with tempfile.TemporaryDirectory() as directory:
            bridge = module.ApprovalBridge(lambda key: pending, resolve, directory,
                http_port=0, http_token='a'*64,
                session_loader=lambda: [dict(provider='hermes', sessionKey=session, label='Test')])
            bridge.sessions.add(session)
            bridge.start()
            def request(body, token='a'*64, extra=None):
                connection = http.client.HTTPConnection('127.0.0.1', bridge.server.server_port, timeout=4)
                headers = {'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'}
                headers.update(extra or {})
                connection.request('POST', '/v1/beepster', json.dumps(body), headers)
                response = connection.getresponse()
                result = response.status, json.loads(response.read())
                connection.close()
                return result
            try:
                self.assertFalse((Path(directory)/'approvals.sock').exists())
                self.assertEqual(request(dict(method='list'), token='bad')[0],401)
                self.assertEqual(request(dict(method='list'), extra={'Origin':'http://evil.test'})[0],403)
                self.assertEqual(request(dict(method='list'), extra={'Host':'evil.test'})[0],403)
                self.assertEqual(request(dict(method='sessions'))[1]['items'][0]['sessionKey'],session)
                row = dict(sessionKey=session, chatID='chat', text='Brief replies')
                self.assertEqual(request(dict(method='prompts.sync',prompts=[row]))[0],200)
                self.assertEqual(bridge.synced_prompts,[row])
                self.assertEqual((Path(directory)/'store-prompts.json').stat().st_mode & 0o777,0o600)
                self.assertEqual(request(dict(method='prompts.sync',prompts=[dict(row,sessionKey='other')]))[0],400)
                self.assertEqual(bridge.synced_prompts,[row])
                self.assertEqual(request(dict(method='prompts.sync',prompts=[]))[0],200)
                self.assertEqual(bridge.synced_prompts,[])
                body = dict(method='resolve',sessionKey=session,id='wrong',decision='deny')
                self.assertEqual(request(body)[0],400)
                body['id']='one'
                self.assertEqual(request(body)[0],200)
                self.assertEqual(request(body)[0],400)
                self.assertEqual(decisions,[(session,'deny','one')])
            finally:
                bridge.stop()

    def test_scoped_system_prompt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            link = dict(provider='hermes',sessionKey='agent:telegram:dm:123',chatID='a',enabled=True)
            (root/'agent-links.json').write_text(json.dumps(dict(links=[link])))
            (root/'thread-prompts.json').write_text(json.dumps(dict(prompts=[dict(link,text='Keep replies brief') ])))
            self.assertEqual(module.thread_prompt(link['sessionKey'],root),'Keep replies brief')
            self.assertEqual(module.thread_prompt('agent:telegram:dm:999',root),'')
            link['enabled']=False
            (root/'agent-links.json').write_text(json.dumps(dict(links=[link])))
            self.assertEqual(module.thread_prompt(link['sessionKey'],root),'')

    def test_slash_cancel_exact_and_expired(self):
        session = 'agent:main:telegram:dm:123'
        decisions = []
        deliveries = []
        class Adapter:
            success = True
            async def send(self, chat, text, metadata=None):
                deliveries.append((chat, text, metadata))
                return SimpleNamespace(success=self.success)
        class Slash:
            entry = dict(confirm_id='1',command='new',created_at=time.time())
            def get_pending(self, key): return self.entry
            async def resolve(self, key, ident, choice):
                if self.entry is None or self.entry['confirm_id'] != ident: return None
                self.entry = None
                decisions.append(choice)
                return 'Cancelled; conversation unchanged.'
        loop = asyncio.new_event_loop()
        thread = threading.Thread(target=loop.run_forever)
        thread.start()
        with tempfile.TemporaryDirectory() as directory:
            bridge = module.ApprovalBridge(lambda key:[],lambda *a,**k:0,directory)
            bridge.sessions.add(session); bridge.slash = Slash(); bridge.loop = loop
            adapter = Adapter()
            bridge.delivery[session] = (adapter, 'test-chat', 'test-topic')
            try:
                item = bridge.items()[0]
                body = dict(method='resolve',id=item['id'],sessionKey=session,decision='deny')
                self.assertTrue(bridge.handle(body)['ok'])
                self.assertEqual(decisions,['cancel'])
                self.assertEqual(deliveries, [('test-chat', 'Cancelled; conversation unchanged.', {'thread_id':'test-topic'})])
                with self.assertRaises(ValueError): bridge.handle(body)
                bridge.slash.entry = dict(confirm_id='2',command='new',created_at=time.time())
                with self.assertRaises(ValueError): bridge.handle(body)
                bridge.slash.entry['created_at'] = time.time() - 301
                self.assertEqual(bridge.items(),[])
                bridge.slash.entry = dict(confirm_id='3',command='reset',created_at=time.time())
                item = bridge.items()[0]
                self.assertIn('ALL future /clear, /new, /reset and /undo', item['alwaysScope'])
                self.assertTrue(bridge.handle(dict(method='resolve',id=item['id'],sessionKey=session,decision='allow-always'))['ok'])
                self.assertEqual(decisions, ['cancel', 'always'])
                bridge.slash.entry = dict(confirm_id='4',command='new',created_at=time.time())
                item = bridge.items()[0]
                adapter.success = False
                failed = dict(method='resolve',id=item['id'],sessionKey=session,decision='allow-once')
                with self.assertRaises(ValueError): bridge.handle(failed)
                self.assertEqual(decisions, ['cancel', 'always', 'once'])
                count = len(deliveries)
                with self.assertRaises(ValueError): bridge.handle(failed)
                self.assertEqual(len(deliveries), count)
            finally:
                loop.call_soon_threadsafe(loop.stop); thread.join(); loop.close()

    def test_exact_requests_and_socket(self):
        session = 'agent:main:telegram:dm:123'
        pending = [{'request_id':'one','command':'echo hello','description':'Test action'}]
        decisions = []
        def resolve(key, choice, request_id):
            decisions.append((key,choice,request_id))
            pending.clear()
            return 1
        with tempfile.TemporaryDirectory() as directory:
            bridge = module.ApprovalBridge(lambda key: pending if key == session else [], resolve, directory)
            bridge.observe(session_key=session, surface='cli')
            self.assertIsNone(bridge.server)
            bridge.observe(session_key=session, surface='gateway')
            try:
                with socket.socket(socket.AF_UNIX) as sock:
                    sock.connect(str(Path(directory)/'approvals.sock'))
                    sock.sendall(b'{"method":"list"}\n')
                    response=json.loads(sock.makefile().readline())
                    self.assertEqual(response['items'][0]['id'],'one')
                for body in [dict(method='resolve',id='other',sessionKey=session,decision='deny'),
                             dict(method='resolve',id='one',sessionKey='other',decision='deny'),
                             dict(method='resolve',id='one',sessionKey=session,decision='always')]:
                    with self.assertRaises(ValueError): bridge.handle(body)
                body=dict(method='resolve',id='one',sessionKey=session,decision='allow-once')
                self.assertTrue(bridge.handle(body)['ok'])
                with self.assertRaises(ValueError): bridge.handle(body)
                self.assertEqual(decisions,[(session,'once','one')])
            finally: bridge.stop()

if __name__ == '__main__': unittest.main()
