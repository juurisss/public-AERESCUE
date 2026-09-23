"""Replay every decoded frame; save review video, frame measurements and contact sheets."""

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

from orange_tracker import OrangeFolderTracker, draw_observation


def evaluate(path, output):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    width, height = int(cap.get(3)), int(cap.get(4))
    writer = cv2.VideoWriter(str(output / (path.stem + '_tracked.mp4')),
                             cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("Review video writer could not open")
    tracker = OrangeFolderTracker()
    counts, rows, tiles, transitions = Counter(), [], [], []
    index, last_state = 0, None
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            obs = tracker.update(frame)
            counts[obs.state] += 1
            if obs.state != last_state:
                transitions.append([index, round(index/fps, 3), obs.state])
                last_state = obs.state
            assert obs.valid or (obs.center is None and obs.bbox is None)
            rows.append([index, index/fps, obs.valid, obs.state,
                         *(obs.center or (None, None)), *(obs.bbox or (None,)*4),
                         obs.area, obs.confidence])
            draw_observation(frame, obs)
            cv2.putText(frame, f'{index} / {index/fps:.2f}s', (10, height-10), 0, .5, (255,255,255), 1)
            writer.write(frame)
            if index % 30 == 0:
                tiles.append(cv2.resize(frame, (320, 184)))
            index += 1
    finally:
        cap.release()
        writer.release()
    with (output / (path.stem + '.csv')).open('w', newline='') as file:
        csv.writer(file).writerows([['frame','seconds','valid','state','cx','cy','x','y','w','h','area','confidence'], *rows])
    summary = dict(video=str(path), decoded_frames=index, fps=fps, states=dict(counts), transitions=transitions)
    (output / (path.stem + '.json')).write_text(json.dumps(summary, indent=2))
    for start in range(0, len(tiles), 24):
        page = tiles[start:start+24]
        while len(page) % 4:
            page.append(np.zeros_like(page[0]))
        cv2.imwrite(str(output / f'{path.stem}_review_{start//24}.jpg'),
                    np.vstack([np.hstack(page[i:i+4]) for i in range(0,len(page),4)]))
    print(json.dumps(summary))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('videos', nargs='*', default=['assets/samples/sample.mp4', 'assets/samples/sample2.mp4'])
    parser.add_argument('--output', type=Path, default=Path('diagnostics/tracker'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for video in args.videos:
        evaluate(Path(video), args.output)
