/** Shared by browser and server: the exact text a party signs when submitting dispute evidence. */
export function evidenceMessage(auction: string, wallet: string, digest: string, at: number) {
  return `BidGuard dispute evidence v1\nauction: ${auction}\nwallet: ${wallet}\ndigest: ${digest}\nat: ${at}`;
}

/** SHA-256 hex of the statement and image hashes (browser + Node via WebCrypto). */
export async function evidenceDigest(statement: string, imageHashes: string[]) {
  const data = new TextEncoder().encode(JSON.stringify({ statement, images: imageHashes }));
  const h = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
