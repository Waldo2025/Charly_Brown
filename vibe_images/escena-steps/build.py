import cv2
import numpy as np
import os

CIRCLES = [
    (263, 165, 118),  # 1 olla de nixtamal
    (153, 400, 106),  # 2 olla de maiz cocido
    (389, 409, 102),  # 3 tortilla en comal
    (1063, 134, 106), # 4 tina de anil
    (1073, 395, 104), # 5 telar de cintura
    (1309, 177, 109), # 6 martillado de cobre
    (1313, 423, 105), # 7 olla de cobre
    (1219, 620, 100), # 8 barro pintado
    (1318, 799, 102), # 9 horno de lena
]
PAD = 24
FEATHER = 5

LABELS = [
    "01-nixtamal",
    "02-maiz-cocido",
    "03-tortilla-comal",
    "04-tinera-anil",
    "05-telar-de-cintura",
    "06-martillado-cobre",
    "07-olla-de-cobre",
    "08-barro-pintado",
    "09-horno-de-lenca",
]
LABELS[8] = "09-horno-de-lena"

src = cv2.imread("source.png")
h, w = src.shape[:2]
base = cv2.imread("base-plate.png")
assert base.shape == src.shape

os.makedirs("out", exist_ok=True)

# precompute per-circle feathered alpha (restores ring + glow)
alphas = []
for x, y, r in CIRCLES:
    m = np.zeros((h, w), np.float32)
    cv2.circle(m, (x, y), r + PAD, 1.0, -1)
    m = cv2.GaussianBlur(m, (0, 0), FEATHER)
    alphas.append(m[..., None])

frames = [( "00-escena-base", [])]
for i, lab in enumerate(LABELS):
    frames.append((lab, list(range(i + 1))))

for lab, idxs in frames:
    img = base.copy()
    for i in idxs:
        img = img * (1 - alphas[i]) + src.astype(np.float32) * alphas[i]
    cv2.imwrite(f"out/{lab}.png", np.clip(img, 0, 255).astype(np.uint8))
    print("wrote", lab, "elements:", [LABELS[i] for i in idxs][-1:] or "-")
