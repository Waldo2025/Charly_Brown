"use strict";

function shouldDestroyProxyMediaUpstream({
  requestAborted = false,
  responseFinished = false,
  responseClosed = false
} = {}) {
  if (requestAborted) return true;
  if (responseClosed && !responseFinished) return true;
  return false;
}

module.exports = {
  shouldDestroyProxyMediaUpstream
};
