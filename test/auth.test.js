"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const app = require("../server");
const { getConfig } = require("../server");
const { encryptPayload, verifyBearer } = require("../lib/token");

const MESSAGE = fs.readFileSync(
  path.join(__dirname, "..", "public", "message.txt"),
  "utf8"
);

function readConst(source, name) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, name);
  const jsonStart = start + marker.length;
  assert.equal(source[jsonStart], '"');
  let i = jsonStart + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === '"') break;
    i += 1;
  }
  return JSON.parse(source.slice(jsonStart, i + 1));
}

function listen() {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function get(port, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function tokenFor(payload) {
  const config = getConfig();
  return encryptPayload(payload, config.publicKey);
}

test("bridge script is plain JavaScript and embeds this request's IP", async () => {
  const server = await listen();
  try {
    const { port } = server.address();
    const res = await get(port, "/bridge", {
      "x-forwarded-for": "203.0.113.5, 10.0.0.4",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /^text\/plain/);
    assert.equal(readConst(res.body, "CLIENT_IP"), "203.0.113.5");
    assert.equal(readConst(res.body, "PASSWORD"), getConfig().password);
    assert.match(readConst(res.body, "PUBLIC_KEY"), /BEGIN PUBLIC KEY/);
    assert.match(readConst(res.body, "DATA_URL"), /^http:\/\/127\.0\.0\.1:\d+\/data$/);
    assert.match(res.body, /timestamp: Date\.now\(\)/);
    assert.doesNotMatch(res.body, /PRIVATE KEY/);
    assert.doesNotMatch(res.body, /\beval\s*\(/);
    assert.doesNotMatch(res.body, /child_process/);

    const file = path.join(os.tmpdir(), `sven-bridge-${process.pid}.js`);
    fs.writeFileSync(file, res.body);
    const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    fs.unlinkSync(file);
    assert.equal(checked.status, 0, checked.stderr);
  } finally {
    await close(server);
  }
});

test("token with the wrong IP is rejected", async () => {
  const server = await listen();
  try {
    const { port } = server.address();
    const bridge = await get(port, "/bridge");
    const seenIp = readConst(bridge.body, "CLIENT_IP");
    const token = tokenFor({
      ip: seenIp === "198.51.100.9" ? "198.51.100.10" : "198.51.100.9",
      password: getConfig().password,
      timestamp: Date.now(),
    });
    const res = await get(port, "/data", { Authorization: `Bearer ${token}` });
    assert.equal(res.status, 401);
    assert.equal(res.body, "wrong ip");
    assert.doesNotMatch(res.body, /Hello from Bigcoin/);
    assert.match(res.headers["content-type"], /^text\/plain/);
  } finally {
    await close(server);
  }
});

test("token older than 500ms is rejected", async () => {
  const server = await listen();
  try {
    const { port } = server.address();
    const bridge = await get(port, "/bridge");
    const token = tokenFor({
      ip: readConst(bridge.body, "CLIENT_IP"),
      password: getConfig().password,
      timestamp: Date.now() - (getConfig().maxTokenAgeMs + 1),
    });
    const res = await get(port, "/data", { Authorization: `Bearer ${token}` });
    assert.equal(res.status, 401);
    assert.equal(res.body, "expired");
  } finally {
    await close(server);
  }
});

test("valid token within 500ms returns the public file text", async () => {
  const server = await listen();
  try {
    const { port } = server.address();
    const bridge = await get(port, "/bridge", {
      "x-forwarded-for": "203.0.113.8, 10.1.1.1",
    });
    const token = tokenFor({
      ip: readConst(bridge.body, "CLIENT_IP"),
      password: readConst(bridge.body, "PASSWORD"),
      timestamp: Date.now(),
    });
    const res = await get(port, "/data", {
      Authorization: `Bearer ${token}`,
      "x-forwarded-for": "203.0.113.8, 10.9.9.9",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, MESSAGE);
    assert.match(res.headers["content-type"], /^text\/plain/);
  } finally {
    await close(server);
  }
});

test("wrong password, future timestamp, and age boundaries", () => {
  const config = getConfig();
  const ip = "203.0.113.4";
  const now = 1_700_000_000_000;

  const wrongPassword = verifyBearer({
    authorization: `Bearer ${encryptPayload(
      { ip, password: "nope", timestamp: now },
      config.publicKey
    )}`,
    privateKey: config.privateKey,
    password: config.password,
    clientIp: ip,
    now,
    maxTokenAgeMs: config.maxTokenAgeMs,
    clockSkewMs: config.clockSkewMs,
  });
  assert.deepEqual(wrongPassword, { ok: false, reason: "bad token" });

  const future = verifyBearer({
    authorization: `Bearer ${encryptPayload(
      { ip, password: config.password, timestamp: now + config.clockSkewMs + 1 },
      config.publicKey
    )}`,
    privateKey: config.privateKey,
    password: config.password,
    clientIp: ip,
    now,
    maxTokenAgeMs: config.maxTokenAgeMs,
    clockSkewMs: config.clockSkewMs,
  });
  assert.deepEqual(future, { ok: false, reason: "expired" });

  function checkAge(delta) {
    return verifyBearer({
      authorization: `Bearer ${encryptPayload(
        { ip, password: config.password, timestamp: now - delta },
        config.publicKey
      )}`,
      privateKey: config.privateKey,
      password: config.password,
      clientIp: ip,
      now,
      maxTokenAgeMs: 500,
      clockSkewMs: config.clockSkewMs,
    });
  }

  assert.equal(checkAge(0).ok, true);
  assert.equal(checkAge(500).ok, true);
  assert.equal(checkAge(501).ok, false);
  assert.equal(checkAge(501).reason, "expired");
  assert.equal(checkAge(-config.clockSkewMs).ok, true);
});

test("message.txt is not served without the data endpoint", async () => {
  const server = await listen();
  try {
    const { port } = server.address();
    const missing = await get(port, "/data");
    assert.equal(missing.status, 401);
    assert.equal(missing.body, "bad token");
    const direct = await get(port, "/message.txt");
    assert.equal(direct.status, 404);
    assert.equal(direct.body, "not found");
  } finally {
    await close(server);
  }
});
