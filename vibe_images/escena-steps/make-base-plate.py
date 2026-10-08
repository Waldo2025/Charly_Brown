import cv2
import numpy as np

CIRCLES = [
    (263, 165, 118), (153, 400, 106), (389, 409, 102),
    (1063, 134, 106), (1073, 395, 104), (1309, 177, 109),
    (1313, 423, 105), (1219, 620, 100), (1318, 799, 102),
]
PAD = 24
BLUR_SIGMA = 16
FEATHER = 6

src = cv2.imread("source.png")
h, w = src.shape[:2]
rng = np.random.default_rng(7)

disc_mask = np.zeros((h, w), np.uint8)
for x, y, r in CIRCLES:
    cv2.circle(disc_mask, (x, y), r + PAD, 255, -1)
mask_f = disc_mask.astype(np.float32) / 255.0

SCALE = 8
sw, sh = w // SCALE, h // SCALE
small = cv2.resize(src, (sw, sh), interpolation=cv2.INTER_AREA)
sm_mask = cv2.resize(disc_mask, (sw, sh), interpolation=cv2.INTER_NEAREST)
sm_mask = cv2.morphologyEx(sm_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
filled = cv2.inpaint(small, sm_mask, 4, cv2.INPAINT_TELEA)
fill = cv2.resize(filled, (w, h), interpolation=cv2.INTER_CUBIC)
fill = cv2.GaussianBlur(fill, (0, 0), BLUR_SIGMA)

grain = rng.normal(0, 2.0, (h, w, 1)).astype(np.float32)
fill = np.clip(fill.astype(np.float32) + grain, 0, 255)

alpha = cv2.GaussianBlur(mask_f, (0, 0), FEATHER)[..., None]
base = src.astype(np.float32) * (1 - alpha) + fill * alpha
cv2.imwrite("base-plate.png", np.clip(base, 0, 255).astype(np.uint8))
print("wrote base-plate.png")
