"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const { clientIp, firstHeaderValue } = require("./lib/ip");
const { loadConfig } = require("./lib/config");
const { verifyBearer } = require("./lib/token");
const { renderBridgeScript } = require("./lib/bridge");

const MESSAGE_FILE = path.join(__dirname, "public", "message.txt");
const HOST_RE = /^[A-Za-z0-9.\-:[\]]+$/;

const config = loadConfig();

function sendText(res, status, body) {
  res.status(status);
  res.set("Cache-Control", "no-store");
  res.type("text/plain; charset=utf-8");
  res.send(body);
}

function requestOrigin(req) {
  let proto = (
    firstHeaderValue(req.headers["x-forwarded-proto"]) ||
    req.protocol ||
    "http"
  ).toLowerCase();
  if (proto !== "http" && proto !== "https") proto = "http";
  const host = req.get("host") || "";
  return { proto, host };
}

function createApp(options = {}) {
  const active = options.config || config;
  const now = options.now || Date.now;
  const app = express();

  app.disable("x-powered-by");
  app.set("etag", false);

  app.get("/", (req, res) => {
    sendText(
      res,
      200,
      [
        "Bigcoin Group bridge",
        "GET /bridge  Node.js client script",
        "GET /data    authenticated public/message.txt",
        "",
      ].join("\n")
    );
  });

  app.get("/bridge", (req, res) => {
    const origin = requestOrigin(req);
    if (!origin.host || !HOST_RE.test(origin.host)) {
      sendText(res, 400, "missing host");
      return;
    }
    const script = renderBridgeScript({
      publicKey: active.publicKey,
      password: active.password,
      clientIp: clientIp(req),
      dataUrl: `${origin.proto}://${origin.host}/data`,
    });
    sendText(res, 200, script);
  });

  app.get("/data", (req, res) => {
    const result = verifyBearer({
      authorization: req.get("authorization"),
      privateKey: active.privateKey,
      password: active.password,
      clientIp: clientIp(req),
      now: now(),
      maxTokenAgeMs: active.maxTokenAgeMs,
      clockSkewMs: active.clockSkewMs,
    });
    if (!result.ok) {
      sendText(res, 401, result.reason);
      return;
    }

    let body;
    try {
      body = fs.readFileSync(MESSAGE_FILE, "utf8");
    } catch {
      console.error("message file unreadable");
      sendText(res, 500, "unavailable");
      return;
    }
    sendText(res, 200, body);
  });

  app.get("/message.txt", (req, res) => {
    sendText(res, 404, "not found");
  });

  app.use((req, res) => {
    sendText(res, 404, "not found");
  });

  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) {
      next(err);
      return;
    }
    sendText(res, 500, "error");
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(
      `sven-vercel listening on ${port} (${config.keySource} RSA key, token age ${config.maxTokenAgeMs}ms)`
    );
  });
}

module.exports = app;
module.exports.default = app;
module.exports.createApp = createApp;
module.exports.getConfig = function getConfig() {
  return config;
};
