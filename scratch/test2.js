const trackIds = ["track1", "track2", "track3"];
const clips = {
  "row1": { rowId: "row1", trackId: "track1", startMs: 0 },
  "row2": { rowId: "row2", trackId: "track2", startMs: 0 },
  "row3": { rowId: "row3", trackId: "track3", startMs: 0 },
  "row4": { rowId: "row4", trackId: "track1", startMs: 0 },
  "row5": { rowId: "row5", trackId: "track2", startMs: 0 },
  "row6": { rowId: "row6", trackId: "track3", startMs: 0 }
};

const rowIndexById = new Map([
  ["row1", 0], ["row2", 1], ["row3", 2],
  ["row4", 3], ["row5", 4], ["row6", 5]
]);

const perTrack = trackIds.map((trackId) => (
  Object.values(clips)
    .filter((clip) => String(clip?.trackId || "").trim() === trackId)
    .sort((a, b) => (
      Number(a.startMs || 0) - Number(b.startMs || 0)
      || Number(rowIndexById.get(String(a?.rowId || "").trim()) || 0) - Number(rowIndexById.get(String(b?.rowId || "").trim()) || 0)
    ))
));

const queue = [];
let pending = true;
for (let round = 0; pending; round += 1) {
  pending = false;
  perTrack.forEach((items) => {
    const clip = items[round];
    if (!clip) return;
    pending = true;
    queue.push(clip);
  });
}

let cursorMs = 0;
const nextClips = {};
queue.forEach((clip, index) => {
  const rowId = clip.rowId;
  const startMs = cursorMs;
  cursorMs += 500;
  nextClips[rowId] = { rowId, startMs };
});

console.log(JSON.stringify(nextClips, null, 2));
