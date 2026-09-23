import cv2

for backend_name, backend in [("DEFAULT", cv2.CAP_ANY), ("DSHOW", cv2.CAP_DSHOW), ("MSMF", cv2.CAP_MSMF)]:
    cap = cv2.VideoCapture(1, backend)
    opened = cap.isOpened()
    ok, frame = cap.read() if opened else (False, None)
    print(f"{backend_name}: opened={opened} frame_ok={ok} shape={frame.shape if ok else None}")
    cap.release()