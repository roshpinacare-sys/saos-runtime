#!/usr/bin/env node
/** receipt.mjs — strip all material from /tmp/rot-result.json into a public receipt.
 *  3-c refs law: the public receipt speaks acct-NN refs ONLY (estate-pseudonym law) —
 *  account identities are mapped through the refs layer (FLEET_ROSTER_MAP secret);
 *  an unmapped estate name fails loudly BEFORE anything is written (never ref-less,
 *  never fabricated). Material was always stripped here; fingerprints stay. */
import fs from "fs";
import { refOf } from "../../scripts/refs.mjs";

const [src, dst] = process.argv.slice(2);
const rot = JSON.parse(fs.readFileSync(src, "utf8"));
const pub = {
  protocol: "SAOS-FLEET-ROTATION-A/1",
  at: rot.at,
  phase: rot.phase,
  summary: rot.summary,
  custodySecrets: ["ROT2_FLEET_KEYS on steem + saos-runtime + Domain (sealed, incremental per account)"],
  accounts: (rot.accounts || []).map((a) => {
    const ref = refOf(a.account);
    if (ref === a.account && !/^acct-\d\d$/.test(String(a.account))) {
      throw new Error("unmapped estate account in rotation receipt: " + a.chain + ":" + a.account + " — add it to FLEET_ROSTER_MAP first (fail-closed, receipt not written)");
    }
    return {
    chain: a.chain,
    account: ref,
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
    };
  }),
  laws: [
    "byte-law: node get_transaction_hex == local serialization before any signature",
    "consensus digest: sha256(chainId || serialized minus tx-level ext byte)",
    "self-verified signatures (secp256k1) before broadcast",
    "chain-judge pre (matched wif vs live authority) and post (RPC authority == new pub)",
    "owner authorities untouched (phase B separate)",
    "zero material in receipt/logs (fingerprints only)",
    "estate-pseudonym law: receipt speaks acct-NN refs only (3-c) — unmapped names fail the receipt writer",
  ],
};
fs.writeFileSync(dst, JSON.stringify(pub, null, 2) + "\n");
console.log("receipt:", dst, "accounts:", pub.accounts.length, "summary:", JSON.stringify(pub.summary));
