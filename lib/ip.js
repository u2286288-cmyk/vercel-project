"use strict";

function normalizeIp(value) {
  let ip = String(value || "").trim();
  if (ip.toLowerCase().startsWith("::ffff:")) {
    ip = ip.slice("::ffff:".length);
  }
  return ip;
}

function firstHeaderValue(value) {
  if (value == null || value === "") return "";
  return String(value).split(",")[0].trim();
}

function clientIp(req) {
  const forwarded = firstHeaderValue(req.headers["x-forwarded-for"]);
  if (forwarded) return normalizeIp(forwarded);
  const fallback = req.ip || (req.socket && req.socket.remoteAddress) || "";
  return normalizeIp(fallback);
}

module.exports = {
  clientIp,
  normalizeIp,
  firstHeaderValue,
};
