import unittest
from unittest.mock import patch, MagicMock

import cv2
import numpy as np

import server
import remote_camera as remote


class RemoteCameraTests(unittest.TestCase):
    def setUp(self):
        remote.reset_active()
        remote.slots.clear()
        self.client = server.app.test_client()
        self.process_patch = patch.object(server, '_processes', {})
        self.process_patch.start()
        self.addCleanup(self.process_patch.stop)
        self.addCleanup(remote.reset_active)
        self.addCleanup(remote.slots.clear)
        hsv = np.zeros((240, 320, 3), np.uint8)
        hsv[70:150, 30:90] = (12, 230, 220)
        self.jpeg = cv2.imencode('.jpg', cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR))[1].tobytes()

    def connect(self, name='1'):
        response = self.client.post('/api/remote/' + name + '/connect')
        self.assertEqual(response.status_code, 200)
        return {'X-Camera-Token': response.json['token']}

    def frame(self, headers, name='1', data=None):
        url = '/api/remote/' + name
        ticket = self.client.post(url + '/ticket', headers=headers).json['ticket']
        return self.client.post(url + '/frame', data=self.jpeg if data is None else data,
            content_type='image/jpeg', headers={**headers, 'X-Frame-Ticket': ticket})

    def test_preview_arm_tracking_stream_and_disconnect(self):
        headers = self.connect()
        self.assertEqual(self.client.post('/api/launch', json={'camera_a':-1, 'camera_b':-2}).status_code, 200)
        self.assertTrue(self.client.get('/api/status').json['running'])
        self.assertEqual(self.frame(headers).status_code, 200)
        state = self.client.get('/api/track?camera=A').json
        self.assertTrue(state['fresh'])
        self.assertFalse(state['locked'])
        self.assertEqual(state['frame_w'], 320)
        self.assertEqual(self.client.post('/api/track-start').status_code, 200)
        for _ in range(3):
            self.assertEqual(self.frame(headers).status_code, 200)
        self.assertTrue(self.client.get('/api/track?camera=A').json['locked'])
        response = self.client.get('/api/video/A', buffered=False)
        self.assertIn(b'Content-Type: image/jpeg', next(response.response))
        response.close()
        self.client.post('/api/remote/1/disconnect', headers=headers)
        state = self.client.get('/api/track?camera=A').json
        self.assertFalse(state['fresh'])
        self.assertIsNone(state['cx'])
        self.assertEqual(self.client.post('/api/stop').status_code, 200)
        self.assertFalse(self.client.get('/api/status').json['running'])

    def test_owner_validation_and_malformed_upload(self):
        headers = self.connect()
        self.assertEqual(self.client.post('/api/remote/1/connect').status_code, 409)
        self.assertEqual(self.client.post('/api/remote/1/ticket').status_code, 403)
        self.assertEqual(self.client.post('/api/remote/1/disconnect').status_code, 403)
        self.assertEqual(self.frame(headers, data=b'bad jpeg').status_code, 400)
        self.assertEqual(self.client.post('/api/remote/1/frame', headers=headers, data=b'x').status_code, 415)
        with patch.object(remote, 'MAX_FRAME_BYTES', 10):
            self.assertEqual(self.client.post('/api/remote/1/frame', headers=headers,
                content_type='image/jpeg', data=b'x' * 11).status_code, 413)

    def test_full_resolution_large_jpeg_preserves_dimensions(self):
        headers = self.connect()
        self.client.post('/api/launch', json={'camera_a':-1, 'camera_b':-2})
        image = np.random.default_rng(42).integers(0, 256, (1080, 1920, 3), dtype=np.uint8)
        data = cv2.imencode('.jpg', image)[1].tobytes()
        self.assertGreater(len(data), 1_000_000)
        self.assertEqual(self.frame(headers, data=data).status_code, 200)
        state = self.client.get('/api/track?camera=A').json
        self.assertEqual((state['frame_w'], state['frame_h']), (1920, 1080))
        decoded = cv2.imdecode(np.frombuffer(remote.jpeg('A'), np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(decoded.shape, image.shape)

    def test_old_frames_and_silent_sender_are_unavailable(self):
        headers = self.connect()
        self.client.post('/api/launch', json={'camera_a':-1, 'camera_b':-2})
        ticket = self.client.post('/api/remote/1/ticket', headers=headers).json['ticket']
        remote.slots['1']['ticket'] = (ticket, 0)
        response = self.client.post('/api/remote/1/frame', data=self.jpeg, content_type='image/jpeg',
            headers={**headers, 'X-Frame-Ticket':ticket})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json['code'], 'FRAME_EXPIRED')
        self.assertEqual(self.frame(headers).status_code, 200)
        self.assertTrue(self.client.get('/api/track?camera=A').json['fresh'])
        remote.slots['1']['measurement']['captured_at'] = 0
        self.assertFalse(self.client.get('/api/track?camera=A').json['fresh'])

    def test_retrying_sender_keeps_slot_reserved(self):
        headers = self.connect()
        remote.slots['1']['seen'] = 0
        self.client.post('/api/remote/1/ticket', headers=headers)
        self.assertEqual(self.client.post('/api/remote/1/connect').status_code, 409)

    def test_mixed_sources_only_spawn_and_arm_local_process(self):
        process = MagicMock()
        process.pid = 123
        process.poll.return_value = None
        with patch.object(server.subprocess, 'Popen', return_value=process) as spawn, \
             patch.object(server.urllib.request, 'urlopen') as urlopen:
            self.assertEqual(self.client.post('/api/launch', json={'camera_a':-1, 'camera_b':0}).status_code, 200)
            self.assertEqual(spawn.call_count, 1)
            self.client.post('/api/track-start')
            self.assertEqual(urlopen.call_count, 1)
            self.assertIn(':5002/arm', urlopen.call_args.args[0].full_url)
            self.client.post('/api/stop')
            process.terminate.assert_called_once()

    def test_reconnect_does_not_arm_preview_and_catalog_has_remote_slots(self):
        self.client.post('/api/launch', json={'camera_a':-1, 'camera_b':-2})
        self.connect()
        self.assertFalse(remote.slots['1']['armed'])
        self.client.post('/api/stop')
        with patch.object(server, '_probe_cameras', return_value=[]):
            self.assertEqual([c['index'] for c in self.client.get('/api/cameras').json['cameras']], [-1, -2])
        with self.client.get('/camera') as response:
            self.assertEqual(response.status_code, 200)
        for route in ('/callibrate', '/calibrate'):
            with self.client.get(route) as response:
                self.assertEqual(response.status_code, 200)
                self.assertIn(b'Wall HFOV calibration', response.data)


if __name__ == '__main__':
    unittest.main()
