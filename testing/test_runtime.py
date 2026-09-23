import time
import unittest
from unittest.mock import patch

import cv2
import numpy as np

import server
from orange_object_tracker import app as runtime
from orange_tracker import OrangeFolderTracker


def frame(x=None):
    hsv = np.zeros((240, 320, 3), np.uint8)
    if x is not None:
        hsv[70:150, x:x+60] = (12, 230, 220)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)


class PipelineTests(unittest.TestCase):
    def test_folder_acquires_in_dim_light_and_tracks_into_shadow(self):
        for brightness in (0.20, 0.35, 0.60, 1.0):
            with self.subTest(brightness=brightness):
                tracker = OrangeFolderTracker()
                dim = (frame(30).astype(np.float32) * brightness).astype(np.uint8)
                for _ in range(3):
                    result = tracker.update(dim)
                self.assertTrue(result.valid)
                self.assertEqual(result.center, (60, 110))
        tracker = OrangeFolderTracker()
        for _ in range(3):
            tracker.update(frame(30))
        shadow = frame(30)
        shadow[70:150, 30:70] = (shadow[70:150, 30:70] * 0.20).astype(np.uint8)
        result = tracker.update(shadow)
        self.assertTrue(result.valid)
        self.assertEqual(result.bbox, (30, 70, 60, 80))
        self.assertFalse(tracker.update(frame()).valid)

    def test_dim_backgrounds_and_ambiguous_folders_are_rejected(self):
        for color in ((12, 230, 20), (12, 100, 90), (12, 140, 90), (12, 180, 90), (12, 200, 90),
                      (60, 230, 90), (0, 0, 90)):
            with self.subTest(color=color):
                hsv = np.zeros((240, 320, 3), np.uint8)
                hsv[70:150, 30:90] = color
                tracker = OrangeFolderTracker()
                for _ in range(3):
                    result = tracker.update(cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR))
                self.assertFalse(result.valid)
        two_folders = cv2.add(frame(30), frame(200))
        two_folders = (two_folders * 0.25).astype(np.uint8)
        tracker = OrangeFolderTracker()
        for _ in range(3):
            self.assertFalse(tracker.update(two_folders).valid)

    def test_small_distant_folder_is_not_rejected_by_resolution_threshold(self):
        source = cv2.VideoCapture('assets/samples/sample3.mp4')
        self.assertTrue(source.isOpened())
        source.set(cv2.CAP_PROP_POS_FRAMES, int(source.get(cv2.CAP_PROP_FPS) * 30))
        ok, image = source.read()
        source.release()
        self.assertTrue(ok)
        candidates, _ = OrangeFolderTracker.candidates(image)
        self.assertTrue(candidates, 'The visible distant orange folder should produce a candidate.')
        self.assertLess(candidates[0].bbox[2], 40)
        tracker = OrangeFolderTracker()
        result = tracker.update(image)
        self.assertFalse(result.valid)
        for _ in range(2):
            result = tracker.update(image)
        self.assertTrue(result.valid)

    def test_edge_on_folder_keeps_lock_when_visible_area_thins(self):
        source = cv2.VideoCapture('assets/samples/sample4.mp4')
        self.assertTrue(source.isOpened())
        tracker = OrangeFolderTracker()
        low_tracker = OrangeFolderTracker()
        observations = {}
        low_observations = {}
        for index in range(1721):
            ok, image = source.read()
            self.assertTrue(ok)
            low_result = low_tracker.update(cv2.resize(image, (320, 184), interpolation=cv2.INTER_AREA))
            if index in (1716, 1720):
                observations[index] = tracker.update(image)
                low_observations[index] = low_result
            else:
                tracker.update(image)
        source.release()

        # During this turn the visible orange area drops below the normal
        # acquisition threshold, but remains near the previous lock. The
        # tracking path must keep accepting that thin, spatially continuous
        # observation instead of declaring an immediate loss.
        self.assertTrue(observations[1716].valid)
        self.assertTrue(observations[1720].valid)
        self.assertLessEqual(observations[1720].area, 10)

        # The same thin turn must remain trackable after a 2x reduction.
        self.assertTrue(low_observations[1716].valid)

    def test_distant_folder_reacquires_after_one_blurred_frame(self):
        source = cv2.VideoCapture('assets/samples/sample3.mp4')
        self.assertTrue(source.isOpened())
        fps = source.get(cv2.CAP_PROP_FPS)
        source.set(cv2.CAP_PROP_POS_FRAMES, int(fps * 30))
        frames = []
        for _ in range(8):
            ok, image = source.read()
            self.assertTrue(ok)
            frames.append(image)
        source.release()
        tracker = OrangeFolderTracker()
        for image in frames[:3]:
            tracker.update(image)
        self.assertTrue(tracker.last_observation.valid)
        missed = tracker.update(np.zeros_like(frames[3]))
        self.assertFalse(missed.valid)
        recovered = tracker.update(frames[4])
        self.assertTrue(recovered.valid)
        self.assertEqual(recovered.state, 'TRACKING')

    def test_independent_loss_and_remote_reacquisition(self):
        a, b = OrangeFolderTracker(), OrangeFolderTracker()
        for _ in range(3):
            first, second = a.update(frame(20)), b.update(frame())
        self.assertTrue(first.valid)
        self.assertFalse(second.valid)
        lost = a.update(frame())
        self.assertFalse(lost.valid)
        self.assertIsNone(lost.center)
        for _ in range(3):
            result = a.update(frame(230))
        self.assertEqual(result.state, 'REACQUIRED')
        self.assertGreater(result.center[0], 230)

    def test_api_rejects_stale_and_malformed_measurements(self):
        server._reset_track_state()
        client = server.app.test_client()
        now = time.time()
        def send(stamp, **extra):
            return client.post('/api/track?camera=A', json=dict(
                captured_at=stamp, locked=True, cx=100, cy=100,
                frame_w=320, frame_h=240, **extra))
        send(now)
        client.post('/api/track?camera=A', json=dict(captured_at=now+.01, locked=False))
        self.assertTrue(send(now).json['ignored'])
        self.assertIsNone(client.get('/api/track?camera=A').json['cx'])
        client.post('/api/track?camera=A', json=dict(captured_at=now+.02, locked=True, cx=None))
        self.assertFalse(client.get('/api/track?camera=A').json['locked'])
        server._reset_track_state()
        send(now-2)
        self.assertFalse(client.get('/api/track?camera=A').json['fresh'])
        self.assertIsNone(client.get('/api/track?camera=A').json['cx'])
        self.assertEqual(client.post('/api/launch', json=dict(camera_a=0, camera_b=0)).status_code, 400)

    def test_actual_capture_loop_uses_folder_tracker_and_invalidates_disconnect(self):
        class Capture:
            def __init__(self):
                self.frames = iter([frame(30)]*3 + [frame()] + [frame(230)]*3)
            def read(self):
                f = next(self.frames, None)
                return f is not None, f
            def release(self):
                pass
        reports = []
        runtime._arm_event.set()
        with patch.object(runtime, '_open_camera', return_value=Capture()), \
             patch.object(runtime, '_start_stream_server', return_value=None), \
             patch.object(runtime, '_report_track', side_effect=lambda *args: reports.append(args)), \
             patch.object(runtime, '_publish_frame'), \
             patch.object(runtime.cv2, 'imshow'), \
             patch.object(runtime.cv2, 'waitKey', return_value=-1), \
             patch.object(runtime.cv2, 'destroyAllWindows'):
            runtime.run(stream_port=0)
        self.assertTrue(reports[2][1])
        self.assertFalse(reports[3][1])
        self.assertIsNone(reports[3][2])
        self.assertTrue(reports[6][1])
        self.assertFalse(reports[-1][1])


if __name__ == '__main__':
    unittest.main()
