# Sven Vercel bridge

Express service for Bigcoin Group. Deploy **this directory** (`sven-vercel/`) on Vercel. The rest of the repository is a separate site; leave the Vercel project root set to `sven-vercel` so that site is not built as this app.

Node.js 20. Two routes:

| Method and path | Response |
| --- | --- |
| `GET /bridge` | A readable Node.js script (`text/plain`) |
| `GET /data` | `public/message.txt` as `text/plain`, after the token checks pass |

`GET /` lists those paths. `public/message.txt` is not a public download: this server answers `/message.txt` with 404, and `vercel.json` redirects that path to `/data` so Vercel does not serve the file from `public/` as a static asset.

## What `/bridge` returns

The script is the client for `/data`. It embeds:

- the RSA public key
- the shared password
- the client IP of the `/bridge` request (`x-forwarded-for` first hop, otherwise `req.ip`)
- the absolute URL of `/data` on this host

When you run it with `node`, at call time it:

1. Builds JSON `{ ip, password, timestamp }` with `timestamp` set to `Date.now()` in milliseconds.
2. Encrypts that JSON with RSA-OAEP and SHA-256 using the embedded public key.
3. Calls `GET /data` with `Authorization: Bearer <base64 ciphertext>`.
4. Prints the response body. That is the file text, or a short rejection.

The script is plain source. It does not obfuscate anything, eval remote code, or call any URL other than this app's `/data`.

## What `/data` checks

The server RSA-decrypts the bearer token, then:

1. The password inside the payload must match the server password. A mismatch is `401` `bad token`.
2. The IP inside the payload must equal this request's client IP, using the same extraction as `/bridge`. A mismatch is `401` `wrong ip`.
3. `Date.now() - timestamp` must be `<= MAX_TOKEN_AGE_MS` (default **500**). A token older than that, or timestamped more than 100ms in the future, is `401` `expired`.

Anything that does not decrypt or is not the expected JSON is `401` `bad token`. Failures are plaintext and omit the password, the private key, and the file.

RSA-OAEP encrypts one block. A 2048-bit key with SHA-256 holds about 190 bytes of JSON. The sample password and a normal IP fit. Keep `AUTH_PASSWORD` short enough that `{ ip, password, timestamp }` stays inside that limit, or generate a larger keypair for Vercel.

## 500ms is a tight bound

Half a second is enough for a local request. A real HTTPS round trip, DNS, and a Vercel cold start can take longer than 500ms, so a freshly generated token can arrive already expired. The default stays 500. Set `MAX_TOKEN_AGE_MS` on Vercel to a larger integer (milliseconds) if live calls are rejected with `expired`.

## Run locally

From this directory:

```bash
npm install
npm start
```

`npm run dev` is the same server with `node --watch`. `npm start` listens on port 3000, or `PORT` if you set it.

Local dev does not need secrets. When `RSA_PRIVATE_KEY`, `RSA_PUBLIC_KEY`, and `AUTH_PASSWORD` are unset, the process generates an ephemeral RSA keypair at startup and uses the password `local-dev-password`. The `/bridge` script embeds that public key and password. The private key stays in memory and is not written to disk. A new process gets a new keypair, so a script from an older process will not decrypt.

Those defaults are for local dev. Production (`NODE_ENV=production` or Vercel) refuses to start until the three env vars are set.

### Walkthrough

In another shell, against a server you just started:

```bash
curl -sS http://127.0.0.1:3000/bridge -o bridge.js
node bridge.js
```

You should see:

```text
Hello from Bigcoin Group.
```

If the second command prints `expired`, the round trip took longer than 500ms. Restart the server with a looser window and fetch a new script:

```bash
MAX_TOKEN_AGE_MS=5000 npm start
```

`vercel dev` from this directory also runs the exported Express app. Use `npm start` when you only want the local Node server.

## Deploy on Vercel

Do not deploy the repository root. In the Vercel project, set **Root Directory** to `sven-vercel`. The framework preset can be Express or Other. Node.js version is 20 (`engines.node`).

`server.js` exports the Express app for the current Vercel Express runtime (`@vercel/node` / zero-config Express). `vercel.json` includes `public/message.txt` in the function bundle and redirects `/message.txt` to `/data`.

Set these environment variables on the Vercel project (Production and Preview). Do not commit the private key.

| Name | Purpose |
| --- | --- |
| `RSA_PRIVATE_KEY` | PKCS#8 PEM private key. Decrypts the bearer token. Env only. |
| `RSA_PUBLIC_KEY` | SPKI PEM public key paired with that private key. Embedded in `/bridge`. |
| `AUTH_PASSWORD` | Shared password placed inside the encrypted payload. |
| `MAX_TOKEN_AGE_MS` | Optional. Positive integer. Default `500`. |

Generate a keypair locally and copy the PEM blocks into Vercel. You can paste real line breaks, or one line with `\n` escapes. The app accepts either.

```bash
node -e 'const crypto=require("crypto"); const k=crypto.generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}}); process.stdout.write("RSA_PUBLIC_KEY\n"+k.publicKey+"\nRSA_PRIVATE_KEY\n"+k.privateKey);'
```

Use the same pair for both vars. An ephemeral keypair cannot be shared across Vercel instances, so production always reads the keys from the environment.

## Tests

```bash
npm test
```

The `node:test` suite talks to the app on localhost and checks:

- a token whose IP does not match the request is `401` `wrong ip`
- a token older than 500ms is `401` `expired`
- a token signed with the right IP, password, and a timestamp inside 500ms returns `public/message.txt`

Those cases mint the timestamp directly, so they do not sleep and do not depend on a wide-area round trip.
