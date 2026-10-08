const { createSpecialistApp } = require('/app/src/charly-resources/server.js');
const type = process.env.CHARLY_SPECIALIST;
if (!['annex', 'cutout', 'worksheet', 'video-script'].includes(type)) throw new Error('Set CHARLY_SPECIALIST');
createSpecialistApp(type).listen(Number(process.env.PORT || 8080), '0.0.0.0');
