"use strict";

const crypto = require("crypto");

const DEFAULT_DEV_PASSWORD = "local-dev-password";
const DEFAULT_MAX_TOKEN_AGE_MS = 500;
const CLOCK_SKEW_MS = 100;

let cached;

function normalizePem(value) {
  if (value == null) return "";
  let text = String(value).trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  return text.replace(/\\n/g, "\n");
}

function productionLike() {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

function loadMaxTokenAgeMs(raw) {
  if (raw == null || String(raw).trim() === "") return DEFAULT_MAX_TOKEN_AGE_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("MAX_TOKEN_AGE_MS must be a non-negative integer");
  }
  return parsed;
}

function loadPassword() {
  const fromEnv = process.env.AUTH_PASSWORD;
  if (fromEnv != null && fromEnv !== "") return fromEnv;
  if (productionLike()) {
    throw new Error(
      "AUTH_PASSWORD is required when NODE_ENV=production or when running on Vercel."
    );
  }
  return DEFAULT_DEV_PASSWORD;
}

function loadKeys() {
  const publicKey = normalizePem(process.env.RSA_PUBLIC_KEY);
  const privateKey = normalizePem(process.env.RSA_PRIVATE_KEY);
  if (publicKey || privateKey) {
    if (!publicKey || !privateKey) {
      throw new Error("Set both RSA_PUBLIC_KEY and RSA_PRIVATE_KEY.");
    }
    return { publicKey, privateKey, keySource: "env" };
  }
  if (productionLike()) {
    throw new Error(
      "RSA_PUBLIC_KEY and RSA_PRIVATE_KEY are required when NODE_ENV=production or when running on Vercel."
    );
  }
  const generated = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    keySource: "ephemeral",
  };
}

function loadConfig() {
  if (!cached) {
    const keys = loadKeys();
    cached = {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      keySource: keys.keySource,
      password: loadPassword(),
      maxTokenAgeMs: loadMaxTokenAgeMs(process.env.MAX_TOKEN_AGE_MS),
      clockSkewMs: CLOCK_SKEW_MS,
    };
  }
  return cached;
}

module.exports = {
  loadConfig,
  DEFAULT_DEV_PASSWORD,
  DEFAULT_MAX_TOKEN_AGE_MS,
  CLOCK_SKEW_MS,
};
