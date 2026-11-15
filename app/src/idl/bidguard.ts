/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bidguard.json`.
 */
export type Bidguard = {
  "address": "6upAUdnE4srVXtYEw1AMhxBxmoZLZ45sJq9dMgRwcp8",
  "metadata": {
    "name": "bidguard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "BidGuard: deposit-backed live auctions with escrow and AI-vetted listings"
  },
  "instructions": [
    {
      "name": "cancelUnsold",
      "docs": [
        "No valid bids: the operator (who saw every bid) closes it and the seller gets the bond back."
      ],
      "discriminator": [
        200,
        104,
        243,
        142,
        39,
        96,
        84,
        65
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "sellerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  108,
                  108,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "buyerToken",
          "docs": [
            "The winning buyer's token account; for unsold auctions any account owned by the seller is fine (nothing is paid to it)."
          ],
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config",
            "auction"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "cancelWithdraw",
      "discriminator": [
        112,
        53,
        226,
        58,
        158,
        30,
        37,
        168
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "vaultTokens",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "confirmDelivery",
      "docs": [
        "The buyer is happy: pay the seller now and return their bond."
      ],
      "discriminator": [
        11,
        109,
        227,
        53,
        179,
        190,
        88,
        155
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "sellerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  108,
                  108,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "buyerToken",
          "docs": [
            "The winning buyer's token account; for unsold auctions any account owned by the seller is fine (nothing is paid to it)."
          ],
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config",
            "auction"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createAuction",
      "docs": [
        "Goes live only when the operator co-signs, i.e. after the agent crew approved the listing.",
        "The seller posts a bond that is slashed if they lose a dispute or never ship."
      ],
      "discriminator": [
        234,
        6,
        201,
        246,
        47,
        219,
        176,
        107
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "operator",
          "docs": [
            "The orchestrator's key: proves the agent crew approved this listing."
          ],
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "auctionId"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "sellerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  108,
                  108,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "auctionId",
          "type": "u64"
        },
        {
          "name": "startPrice",
          "type": "u64"
        },
        {
          "name": "minIncrement",
          "type": "u64"
        },
        {
          "name": "endsAt",
          "type": "i64"
        },
        {
          "name": "listingHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "trustScore",
          "type": "u8"
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "Pre-fund bidding power. Like registering with a deposit at a live auction house."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "vaultTokens",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidderToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "configParams"
            }
          }
        }
      ]
    },
    {
      "name": "markDelivered",
      "docs": [
        "Carrier-tracking oracle: the operator reports delivery, which starts the buyer's review window."
      ],
      "discriminator": [
        240,
        118,
        188,
        142,
        64,
        85,
        107,
        18
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "markShipped",
      "discriminator": [
        239,
        5,
        66,
        105,
        238,
        17,
        89,
        97
      ],
      "accounts": [
        {
          "name": "seller",
          "signer": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "tracking",
          "type": "string"
        }
      ]
    },
    {
      "name": "raiseDispute",
      "discriminator": [
        41,
        243,
        1,
        51,
        150,
        95,
        246,
        73
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "refundUnshipped",
      "docs": [
        "The seller never shipped: anyone may refund the buyer once the ship window passed.",
        "The seller's bond goes to the buyer as compensation."
      ],
      "discriminator": [
        68,
        79,
        132,
        124,
        3,
        87,
        233,
        201
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "sellerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  108,
                  108,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "buyerToken",
          "docs": [
            "The winning buyer's token account; for unsold auctions any account owned by the seller is fine (nothing is paid to it)."
          ],
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config",
            "auction"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "releaseAfterTimeout",
      "docs": [
        "The buyer stayed silent after delivery: anyone may release once the review window passed."
      ],
      "discriminator": [
        102,
        1,
        6,
        82,
        208,
        207,
        32,
        7
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "sellerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  108,
                  108,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "buyerToken",
          "docs": [
            "The winning buyer's token account; for unsold auctions any account owned by the seller is fine (nothing is paid to it)."
          ],
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config",
            "auction"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "requestWithdraw",
      "docs": [
        "Withdrawals are two-step: request now, execute after the cooldown. The auction server",
        "subtracts pending withdrawals from bidding power, so a bid can never be backed by money",
        "that is about to leave."
      ],
      "discriminator": [
        137,
        95,
        187,
        96,
        250,
        138,
        31,
        182
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "vaultTokens",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "resolveDispute",
      "docs": [
        "Executes a dispute outcome. The Dispute Judge Agent recommends `buyer_bps`; only the arbiter",
        "key can execute it. Funds can only go to the buyer, the seller or the fee treasury.",
        "If the buyer receives half or more, the seller's bond is slashed to the buyer."
      ],
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "sellerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  108,
                  108,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "auction"
          ]
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "buyerToken",
          "docs": [
            "The winning buyer's token account; for unsold auctions any account owned by the seller is fine (nothing is paid to it)."
          ],
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config",
            "auction"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "buyerBps",
          "type": "u16"
        },
        {
          "name": "note",
          "type": "string"
        }
      ]
    },
    {
      "name": "setAgent",
      "docs": [
        "Lets a buyer's Concierge Agent bid for them with its own key, up to a hard cap that the",
        "program enforces at settlement. The agent can never spend more than `cap` in total."
      ],
      "discriminator": [
        154,
        74,
        121,
        91,
        137,
        19,
        101,
        166
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "vaultTokens",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "agent",
          "type": "pubkey"
        },
        {
          "name": "cap",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleAuction",
      "docs": [
        "Settles the winning bid. The previous instruction in the transaction must be an Ed25519",
        "signature check of the bid message, signed by the bidder (or their capped agent key).",
        "Funds move straight from the winner's Bid Vault into this auction's escrow."
      ],
      "discriminator": [
        246,
        196,
        183,
        98,
        222,
        139,
        46,
        133
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "auction.seller",
                "account": "auction"
              },
              {
                "kind": "account",
                "path": "auction.auction_id",
                "account": "auction"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "auction"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "vaultTokens",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "arg",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config",
            "auction"
          ]
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "bidder",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "expiry",
          "type": "i64"
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "configParams"
            }
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "bidder",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "vaultTokens",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidderToken",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "auction",
      "discriminator": [
        218,
        94,
        247,
        242,
        126,
        233,
        131,
        81
      ]
    },
    {
      "name": "bidVault",
      "discriminator": [
        154,
        253,
        219,
        232,
        246,
        4,
        228,
        229
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "sellerProfile",
      "discriminator": [
        96,
        227,
        91,
        129,
        3,
        158,
        255,
        21
      ]
    }
  ],
  "events": [
    {
      "name": "auctionCreated",
      "discriminator": [
        133,
        190,
        194,
        65,
        172,
        0,
        70,
        178
      ]
    },
    {
      "name": "auctionReleased",
      "discriminator": [
        45,
        189,
        76,
        8,
        243,
        233,
        184,
        2
      ]
    },
    {
      "name": "auctionSettled",
      "discriminator": [
        61,
        151,
        131,
        170,
        95,
        203,
        219,
        147
      ]
    },
    {
      "name": "vaultDeposited",
      "discriminator": [
        59,
        62,
        43,
        200,
        220,
        104,
        100,
        67
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero and within your balance"
    },
    {
      "code": 6001,
      "name": "feeTooHigh",
      "msg": "Fee is above the 10% cap"
    },
    {
      "code": 6002,
      "name": "invalidSplit",
      "msg": "Invalid split"
    },
    {
      "code": 6003,
      "name": "invalidWindow",
      "msg": "Invalid time window"
    },
    {
      "code": 6004,
      "name": "invalidEndTime",
      "msg": "End time must be in the future"
    },
    {
      "code": 6005,
      "name": "invalidTrustScore",
      "msg": "Trust score must be 0-100"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "Not allowed"
    },
    {
      "code": 6007,
      "name": "wrongStatus",
      "msg": "The auction is not in the right state for this"
    },
    {
      "code": 6008,
      "name": "auctionNotEnded",
      "msg": "The auction hasn't ended yet"
    },
    {
      "code": 6009,
      "name": "bidTooLow",
      "msg": "Bid is below the starting price"
    },
    {
      "code": 6010,
      "name": "bidExpired",
      "msg": "This signed bid has expired"
    },
    {
      "code": 6011,
      "name": "missingSignatureCheck",
      "msg": "Missing the Ed25519 signature check for the bid"
    },
    {
      "code": 6012,
      "name": "badSignature",
      "msg": "The bid signature doesn't match"
    },
    {
      "code": 6013,
      "name": "agentCapExceeded",
      "msg": "The Concierge Agent would exceed its spending cap"
    },
    {
      "code": 6014,
      "name": "insufficientVault",
      "msg": "Not enough available funds in the Bid Vault"
    },
    {
      "code": 6015,
      "name": "noPendingWithdrawal",
      "msg": "No withdrawal was requested"
    },
    {
      "code": 6016,
      "name": "cooldownActive",
      "msg": "Withdrawal cooldown has not passed yet"
    },
    {
      "code": 6017,
      "name": "shipWindowClosed",
      "msg": "The shipping window has closed"
    },
    {
      "code": 6018,
      "name": "windowNotPassed",
      "msg": "The waiting period hasn't passed yet"
    },
    {
      "code": 6019,
      "name": "noteTooLong",
      "msg": "Text is empty or too long"
    },
    {
      "code": 6020,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "auction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "auctionId",
            "type": "u64"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "minIncrement",
            "type": "u64"
          },
          {
            "name": "bond",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "endsAt",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "shippedAt",
            "type": "i64"
          },
          {
            "name": "deliveredAt",
            "type": "i64"
          },
          {
            "name": "disputedAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "auctionStatus"
              }
            }
          },
          {
            "name": "buyerBps",
            "type": "u16"
          },
          {
            "name": "listingHash",
            "docs": [
              "SHA-256 of the approved listing (title, description, photos), tying the auction to what the agents checked."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trustScore",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "escrowBump",
            "type": "u8"
          },
          {
            "name": "tracking",
            "type": "string"
          },
          {
            "name": "disputeReason",
            "type": "string"
          },
          {
            "name": "resolutionNote",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "auctionCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "endsAt",
            "type": "i64"
          },
          {
            "name": "trustScore",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "auctionReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "auctionSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "byAgent",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "auctionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "live"
          },
          {
            "name": "funded"
          },
          {
            "name": "shipped"
          },
          {
            "name": "delivered"
          },
          {
            "name": "disputed"
          },
          {
            "name": "released"
          },
          {
            "name": "refunded"
          },
          {
            "name": "resolved"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "bidVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "pendingWithdrawal",
            "type": "u64"
          },
          {
            "name": "withdrawRequestedAt",
            "type": "i64"
          },
          {
            "name": "agent",
            "docs": [
              "Optional Concierge Agent key allowed to sign bids for this vault, up to `agent_cap`."
            ],
            "type": "pubkey"
          },
          {
            "name": "agentCap",
            "type": "u64"
          },
          {
            "name": "agentSpent",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tokensBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "docs": [
              "Auction server / agent orchestrator: approves listings, settles winning bids, reports delivery."
            ],
            "type": "pubkey"
          },
          {
            "name": "arbiter",
            "docs": [
              "Executes dispute outcomes recommended by the Dispute Judge Agent (a multisig in production)."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "bondBps",
            "type": "u16"
          },
          {
            "name": "minBond",
            "type": "u64"
          },
          {
            "name": "shipWindowSecs",
            "type": "i64"
          },
          {
            "name": "releaseWindowSecs",
            "type": "i64"
          },
          {
            "name": "withdrawCooldownSecs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "arbiter",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "bondBps",
            "type": "u16"
          },
          {
            "name": "minBond",
            "type": "u64"
          },
          {
            "name": "shipWindowSecs",
            "type": "i64"
          },
          {
            "name": "releaseWindowSecs",
            "type": "i64"
          },
          {
            "name": "withdrawCooldownSecs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "sellerProfile",
      "docs": [
        "Portable on-chain seller reputation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "auctionsCreated",
            "type": "u64"
          },
          {
            "name": "salesCompleted",
            "type": "u64"
          },
          {
            "name": "failedShipments",
            "type": "u64"
          },
          {
            "name": "disputesWon",
            "type": "u64"
          },
          {
            "name": "disputesLost",
            "type": "u64"
          },
          {
            "name": "volume",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vaultDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
