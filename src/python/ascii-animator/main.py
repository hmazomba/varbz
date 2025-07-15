import cv2
import numpy as np
from PIL import Image, ImageSequence
import os
import time
import sys
import shutil

# Dark to light characters
ASCII_CHARS = "@%#*+=-:. "

def resize_image(image, new_width=80):
    height, width = image.shape[:2]
    aspect_ratio = height / width
    new_height = int(aspect_ratio * new_width * 0.55)  # Adjust for terminal character aspect ratio
    return cv2.resize(image, (new_width, new_height))

def frame_to_ascii(frame, width=80):
    if frame is None:
        return "[ERROR: Empty frame received]"

    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    except Exception as e:
        return f"[ERROR: Failed to convert frame to grayscale: {e}]"

    resized = resize_image(gray, new_width=width)
    ascii_image = ""
    for row in resized:
        ascii_image += "".join([
            ASCII_CHARS[min(len(ASCII_CHARS) - 1, int(pixel) * len(ASCII_CHARS) // 256)]
            for pixel in row
        ]) + "\n"
    return ascii_image

def play_video_ascii(path, width=80):
    print("[INFO] Playing video... Press CTRL+C to stop.")
    try:
        while True:
            cap = cv2.VideoCapture(path)
            if not cap.isOpened():
                print("[ERROR] Could not open video file.")
                return

            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break  # End of video — loop back to start
                ascii_frame = frame_to_ascii(frame, width)
                os.system('cls' if os.name == 'nt' else 'clear')
                print(ascii_frame)
                time.sleep(1 / 30)  # ~30 FPS

            cap.release()
    except KeyboardInterrupt:
        print("\n[INFO] Video playback interrupted by user.")

def play_gif_ascii(path, width=80):
    try:
        gif = Image.open(path)
        frames = [frame.copy().convert("RGB") for frame in ImageSequence.Iterator(gif)]
        print("[INFO] Playing GIF... Press CTRL+C to stop.")
        while True:
            for frame in frames:
                frame_np = np.array(frame)
                frame_cv2 = cv2.cvtColor(frame_np, cv2.COLOR_RGB2BGR)
                ascii_frame = frame_to_ascii(frame_cv2, width)
                os.system('cls' if os.name == 'nt' else 'clear')
                print(ascii_frame)
                time.sleep(0.07)
    except KeyboardInterrupt:
        print("\n[INFO] GIF playback interrupted by user.")
    except Exception as e:
        print(f"[ERROR] Failed to play GIF: {e}")

def get_terminal_width(default=80):
    try:
        return shutil.get_terminal_size().columns
    except Exception:
        return default

def animate_ascii(path, width=None):
    ext = os.path.splitext(path)[1].lower()
    width = width or get_terminal_width()

    if ext in ['.mp4', '.avi', '.mov', '.mkv']:
        play_video_ascii(path, width)
    elif ext == '.gif':
        play_gif_ascii(path, width)
    else:
        print("[ERROR] Unsupported file type. Please use .mp4, .avi, .mov, .mkv, or .gif")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ascii_animator.py <path_to_video_or_gif> [width]")
    else:
        video_path = sys.argv[1]
        width = int(sys.argv[2]) if len(sys.argv) > 2 else None
        animate_ascii(video_path, width)
