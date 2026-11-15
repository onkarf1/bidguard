import "server-only";
import { MongoClient, type Db } from "mongodb";
import { CLUSTER } from "./config";

/**
 * MongoDB Atlas. One database per cluster (bidguard_devnet / bidguard_localnet) so test runs
 * never mix with the demo. Indexes are created once per server instance.
 */
const g = globalThis as unknown as { __bgMongo?: Promise<Db> };

export function db(): Promise<Db> {
  if (!g.__bgMongo) {
    // Don't cache a failed connection: the next request retries.
    g.__bgMongo = connect().catch((e) => {
      g.__bgMongo = undefined;
      console.error("MongoDB connection failed:", e?.name, String(e?.message ?? "").replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>").slice(0, 300));
      throw e;
    });
  }
  return g.__bgMongo;
}

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in app/.env.local");
  const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const d = client.db(`bidguard_${CLUSTER}`);
  await Promise.all([
    d.collection("listings").createIndex({ status: 1, createdAt: -1 }),
    d.collection("listings").createIndex({ seller: 1 }),
    d.collection("auctions").createIndex({ status: 1, endsAt: 1 }),
    d.collection("auctions").createIndex({ listingId: 1 }, { unique: true }),
    d.collection("auctions").createIndex({ currentBidder: 1, status: 1 }),
    d.collection("bids").createIndex({ auctionId: 1, amount: -1 }),
    d.collection("bids").createIndex({ bidder: 1, nonce: 1 }, { unique: true }),
    d.collection("events").createIndex({ auctionId: 1, _id: 1 }),
    d.collection("agent_runs").createIndex({ listingId: 1 }),
    d.collection("images").createIndex({ seller: 1 }),
    d.collection("rate_limits").createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return d;
}
