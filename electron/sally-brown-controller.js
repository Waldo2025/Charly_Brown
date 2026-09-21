const core = require("../backend/sally/controller.js");
const { app } = require("electron");
module.exports = {
  ...core,
  createSallyBrownController: options => core.createSallyBrownController({ ...options, getPath: name => app.getPath(name) })
};
