"use strict";

const crypto = require("crypto");

const REASONS = {
  badToken: "bad token",
  wrongIp: "wrong ip",
  expired: "expired",
};

const RSA_OAEP = {
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha256",
};

function passwordsMatch(left, right) {
  const a = crypto.createHash("sha256").update(String(left), "utf8").digest();
  const b = crypto.createHash("sha256").update(String(right), "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function readBearer(authorization) {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim());
  if (!match) return null;
  return match[1];
}

function encryptPayload(payload, publicKey) {
  const json = JSON.stringify({
    ip: payload.ip,
    password: payload.password,
    timestamp: payload.timestamp,
  });
  return crypto
    .publicEncrypt({ ...RSA_OAEP, key: publicKey }, Buffer.from(json, "utf8"))
    .toString("base64");
}

function decryptPayload(token, privateKey) {
  const raw = Buffer.from(token, "base64");
  if (raw.length === 0) {
    throw new Error("empty ciphertext");
  }
  const plaintext = crypto.privateDecrypt(
    { ...RSA_OAEP, key: privateKey },
    raw
  );
  return JSON.parse(plaintext.toString("utf8"));
}

function verifyBearer({
  authorization,
  privateKey,
  password,
  clientIp,
  now,
  maxTokenAgeMs,
  clockSkewMs,
}) {
  const token = readBearer(authorization);
  if (!token) return { ok: false, reason: REASONS.badToken };

  let payload;
  try {
    payload = decryptPayload(token, privateKey);
  } catch {
    return { ok: false, reason: REASONS.badToken };
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.ip !== "string" ||
    typeof payload.password !== "string" ||
    typeof payload.timestamp !== "number" ||
    !Number.isFinite(payload.timestamp)
  ) {
    return { ok: false, reason: REASONS.badToken };
  }

  if (!passwordsMatch(payload.password, password)) {
    return { ok: false, reason: REASONS.badToken };
  }

  if (payload.ip !== clientIp) {
    return { ok: false, reason: REASONS.wrongIp };
  }

  const age = now - payload.timestamp;
  if (age > maxTokenAgeMs || age < -clockSkewMs) {
    return { ok: false, reason: REASONS.expired };
  }

  return { ok: true };
}

module.exports = {
  REASONS,
  encryptPayload,
  verifyBearer,
};
