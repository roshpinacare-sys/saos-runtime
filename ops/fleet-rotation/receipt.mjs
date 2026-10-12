#!/usr/bin/env node
/** receipt.mjs — strip all material from /tmp/rot-result.json into a public receipt. */
import fs from "fs";

const [src, dst] = process.argv.slice(2);
const rot = JSON.parse(fs.readFileSync(src, "utf8"));
const pub = {
  protocol: "SAOS-FLEET-ROTATION-A/1",
  at: rot.at,
  phase: rot.phase,
  summary: rot.summary,
  custodySecrets: ["ROT2_FLEET_KEYS on steem + saos-runtime + Domain (sealed, incremental per account)"],
  accounts: (rot.accounts || []).map((a) => ({
    chain: a.chain,
    account: a.account,
    verdict: a.verdict,
    signerRole: a.signerRole,
    txid: a.txid,
    digestFp: a.digestFp,
    chainVerified: a.chainVerified,
    oldPubFp: a.oldPubFp,
    newPubFp: a.newPubFp,
    error: a.error,
    custodyRepos: a.custody,
    custodyError: a.custodyError,
  })),
  laws: [
    "byte-law: node get_transaction_hex == local serialization before any signature",
    "consensus digest: sha256(chainId || serialized minus tx-level ext byte)",
    "self-verified signatures (secp256k1) before broadcast",
    "chain-judge pre (matched wif vs live authority) and post (RPC authority == new pub)",
    "owner authorities untouched (phase B separate)",
    "zero material in receipt/logs (fingerprints only)",
  ],
};
fs.writeFileSync(dst, JSON.stringify(pub, null, 2) + "\n");
console.log("receipt:", dst, "accounts:", pub.accounts.length, "summary:", JSON.stringify(pub.summary));
