#!/usr/bin/env python3
# Afinador de clips de Servidor Snoopy que no necesita instalar nada: corre con el
# mismo Python de ComfyUI (PyAV + Pillow). Reescala con lanczos y afina con unsharp,
# igual que ffmpeg, para que un clip nacido en 640x352 se guarde como 1080p.
#
# Uso: python polish-clip.py --input in.mp4 --output out.mp4 --width 1920 --height 1056
import argparse
import json
import sys
import time


def parse_args():
    parser = argparse.ArgumentParser(description="Reescala y afina un clip mp4.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--crf", default="18")
    parser.add_argument("--fps", type=int, default=0, help="cadencia de salida (0 = la del clip)")
    parser.add_argument("--blend", action="store_true", help="mezcla grupos de fotogramas para subir la cadencia")
    parser.add_argument("--radius", type=float, default=1.6)
    parser.add_argument("--percent", type=int, default=110)
    parser.add_argument("--threshold", type=int, default=2)
    return parser.parse_args()


def main():
    args = parse_args()
    if args.width < 16 or args.height < 16:
        raise SystemExit("El tamaño de salida debe ser al menos 16x16.")

    import av
    from PIL import Image, ImageFilter

    started = time.time()
    source = av.open(args.input)
    stream = source.streams.video[0]
    rate = float(stream.average_rate or 12)
    # 8 o 12 fps se ven a saltos. Mezclar grupos de fotogramas vecinos da movimiento
    # continuo sin pedirle un modelo nuevo a la GPU.
    out_rate = int(round(args.fps)) if args.fps and args.fps > rate else int(round(rate))
    # Solo se mezcla cuando la salida es un múltiplo exacto de la cadencia de la GPU
    # (8→24, 12→24). Con 16 fps el siguiente paso sería 32: se queda como está.
    factor = 0
    if args.blend and rate > 0:
        candidate = out_rate / rate
        if 2 <= candidate <= 3 and abs(candidate - round(candidate)) < 1e-6:
            factor = int(round(candidate))

    target = av.open(args.output, mode="w", format="mp4")
    encoder = target.add_stream("libx264", rate=out_rate)
    encoder.width = args.width
    encoder.height = args.height
    encoder.pix_fmt = "yuv420p"
    encoder.options = {"crf": str(args.crf), "preset": "veryfast"}

    sharpen = ImageFilter.UnsharpMask(
        radius=args.radius, percent=args.percent, threshold=args.threshold
    )

    frames = 0

    def write(image):
        nonlocal frames
        for packet in encoder.encode(av.VideoFrame.from_image(image)):
            target.mux(packet)
        frames += 1

    previous = None
    for frame in source.decode(stream):
        image = frame.to_image().resize((args.width, args.height), Image.LANCZOS).filter(sharpen)
        if previous is not None and factor:
            for step in range(1, factor):
                write(Image.blend(previous, image, step / factor))
        write(image)
        previous = image
    if factor and previous is not None:
        # Los fotogramas que faltan del último grupo dejan la duración exacta:
        # factor·N cuadros a factor·rate ocupan lo mismo que N a rate.
        for _ in range(factor - 1):
            write(previous)
    for packet in encoder.encode():
        target.mux(packet)

    target.close()
    source.close()
    json.dump(
        {
            "frames": frames,
            "width": args.width,
            "height": args.height,
            "fps": out_rate,
            "blend": factor,
            "seconds": round(time.time() - started, 2),
        },
        sys.stdout,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # el motor decide el plan B (clip nativo)
        sys.stderr.write(f"{type(error).__name__}: {error}\n")
        sys.exit(1)
