const maxTick = 65535;
const resolution = 10;
const hasHrtime = typeof process !== "undefined" && typeof process.hrtime === "function";
const timeDiff = hasHrtime ? (1e9 / resolution) : (1e3 / resolution);

const now = hasHrtime
  ? () => {
    const [seconds, nanoseconds] = process.hrtime();
    return (seconds * 1e9) + nanoseconds;
  }
  : () => performance.now();

function getTick(start = 0) {
  return ((now() - start) / timeDiff) & maxTick;
}

export default function throughput(seconds = 5) {
  const start = now();
  const size = resolution * (Number(seconds || 5) || 5);
  const buffer = [0];
  let pointer = 1;
  let last = (getTick(start) - 1) & maxTick;

  return function sample(delta = 0) {
    const tick = getTick(start);
    let distance = (tick - last) & maxTick;
    if (distance > size) distance = size;
    last = tick;

    while (distance > 0) {
      if (pointer === size) pointer = 0;
      buffer[pointer] = buffer[pointer === 0 ? size - 1 : pointer - 1];
      pointer += 1;
      distance -= 1;
    }

    if (delta) buffer[pointer - 1] += delta;

    const top = buffer[pointer - 1];
    const bottom = buffer.length < size ? 0 : buffer[pointer === size ? 0 : pointer];
    return buffer.length < resolution ? top : ((top - bottom) * resolution / buffer.length);
  };
}
