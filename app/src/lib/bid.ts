/**
 * The exact text a bidder signs. Must match `bid_message` in programs/bidguard/src/lib.rs
 * byte for byte: the program rebuilds it and compares against the Ed25519-verified message.
 */
export function bidMessage(auction: string, amount: number, nonce: number, expiry: number) {
  return `BidGuard bid v1\nauction: ${auction}\namount: ${amount}\nnonce: ${nonce}\nexpires: ${expiry}`;
}
