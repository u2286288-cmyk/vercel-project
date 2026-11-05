"use strict";

function renderBridgeScript({ publicKey, password, clientIp, dataUrl }) {
  return `"use strict";

// Readable client for this app's GET /data route.
// It only builds a JSON payload, RSA-OAEP encrypts it, and calls DATA_URL.
// It does not fetch or eval any other code.

const crypto = require("crypto");

const PUBLIC_KEY = ${JSON.stringify(publicKey)};
const PASSWORD = ${JSON.stringify(password)};
const CLIENT_IP = ${JSON.stringify(clientIp)};
const DATA_URL = ${JSON.stringify(dataUrl)};

async function main() {
  const payload = JSON.stringify({
    ip: CLIENT_IP,
    password: PASSWORD,
    timestamp: Date.now(),
  });

  const ciphertext = crypto.publicEncrypt(
    {
      key: PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(payload, "utf8")
  );

  const response = await fetch(DATA_URL, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + ciphertext.toString("base64"),
    },
  });

  const body = await response.text();
  console.log(body);
  if (!response.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exitCode = 1;
});
`;
}

module.exports = {
  renderBridgeScript,
};
