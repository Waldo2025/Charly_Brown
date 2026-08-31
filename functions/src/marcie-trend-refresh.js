const { periodKey, refreshMarcieTrends } = require("./marcie-editorial-research.js");

async function refreshMarcieTrendsIfDue(now = new Date()) {
  return refreshMarcieTrends({ now, force: false });
}

module.exports = { periodKey, refreshMarcieTrendsIfDue };
