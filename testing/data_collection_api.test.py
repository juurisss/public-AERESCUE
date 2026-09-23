import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class DataCollectionApiTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_dir = server.EXPERIMENT_DATA_DIR
        server.EXPERIMENT_DATA_DIR = Path(self.temp.name)
        server.app.config.update(TESTING=True)
        self.client = server.app.test_client()

    def tearDown(self):
        server.EXPERIMENT_DATA_DIR = self.original_dir
        self.temp.cleanup()

    def test_session_and_records_are_persistent_and_duplicate_trials_rejected(self):
        page = self.client.get('/data-collection/')
        self.assertEqual(page.status_code, 200)
        self.assertIn(b'Target localization', page.data)
        page.close()
        asset = self.client.get('/data-collection/app.js')
        self.assertEqual(asset.status_code, 200)
        asset.close()
        created = self.client.post('/api/data/sessions', json={
            'sessionId': 'AERESCUE-TEST-01', 'baseline': 2.5,
            'notes': 'test session', 'calibration': {'phiA': 1.2, 'phiB': -0.7},
        })
        self.assertEqual(created.status_code, 201)

        record = {'trialId': 'TARGET-001', 'validity': 'Valid', 'midpointAbsoluteError': 0.1}
        saved = self.client.post('/api/data/sessions/AERESCUE-TEST-01/records/target-localization', json=record)
        self.assertEqual(saved.status_code, 200)

        duplicate = self.client.post('/api/data/sessions/AERESCUE-TEST-01/records/relative-distance', json=record)
        self.assertEqual(duplicate.status_code, 409)

        loaded = self.client.get('/api/data/sessions/AERESCUE-TEST-01')
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.json['session']['target-localization'][0]['trialId'], 'TARGET-001')
        self.assertEqual(loaded.json['session']['metadata']['baseline'], 2.5)


if __name__ == '__main__':
    unittest.main()
