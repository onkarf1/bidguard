/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trustlink.json`.
 */
export type Trustlink = {
  "address": "3xYeBR8Cb1Eh8Fwb4U36ceUGE9V1MfjtzSc2z6JJv1Bg",
  "metadata": {
    "name": "trustlink",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "TrustLink: USDC escrow with AI-assisted dispute resolution"
  },
  "instructions": [
    {
      "name": "cancelDeal",
      "docs": [
        "Seller withdraws a deal nobody has paid for yet; rent is returned."
      ],
      "discriminator": [
        158,
        86,
        193,
        45,
        168,
        111,
        48,
        29
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
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
                "path": "deal"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "createDeal",
      "docs": [
        "Seller opens a deal. Anyone holding the link can then fund it."
      ],
      "discriminator": [
        198,
        212,
        144,
        151,
        97,
        56,
        149,
        113
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              },
              {
                "kind": "arg",
                "path": "dealId"
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
                "path": "deal"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
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
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "dealId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "deliveryDeadline",
          "type": "i64"
        },
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "terms",
          "type": "string"
        }
      ]
    },
    {
      "name": "fundDeal",
      "docs": [
        "Buyer locks the full amount in the vault."
      ],
      "discriminator": [
        8,
        26,
        74,
        169,
        132,
        56,
        104,
        60
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
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
                "path": "deal"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "deal"
          ]
        },
        {
          "name": "buyerToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "initializeConfig",
      "docs": [
        "One-time platform setup: who arbitrates disputes, and where fees go."
      ],
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
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
        }
      ]
    },
    {
      "name": "raiseDispute",
      "docs": [
        "Either party freezes the deal and asks for arbitration."
      ],
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
          "name": "authority",
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
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
      "name": "refundExpired",
      "docs": [
        "Buyer gets a full refund if the seller never delivered by the deadline."
      ],
      "discriminator": [
        118,
        153,
        164,
        244,
        40,
        128,
        242,
        250
      ],
      "accounts": [
        {
          "name": "buyer",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
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
                "path": "deal"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "deal"
          ]
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "buyerToken",
          "writable": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
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
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "releaseFunds",
      "docs": [
        "Pays the seller (minus platform fee). Callable by:",
        "- the buyer, any time after funding (they're happy), or",
        "- the seller, once the review period after delivery has elapsed with no dispute."
      ],
      "discriminator": [
        225,
        88,
        91,
        108,
        126,
        52,
        2,
        26
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
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
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
                "path": "deal"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "deal"
          ]
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
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
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "resolveDispute",
      "docs": [
        "Arbiter splits the escrow. `buyer_bps` = share refunded to the buyer (0..=10000).",
        "The arbiter must wait for the counterparty's response, or for the response window to lapse."
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
          "name": "arbiter",
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
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
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
                "path": "deal"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "deal"
          ]
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "buyer",
          "relations": [
            "deal"
          ]
        },
        {
          "name": "sellerToken",
          "writable": true
        },
        {
          "name": "buyerToken",
          "writable": true
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
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
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "buyerBps",
          "type": "u16"
        },
        {
          "name": "resolutionNote",
          "type": "string"
        }
      ]
    },
    {
      "name": "respondDispute",
      "docs": [
        "The other party tells their side of the story (once)."
      ],
      "discriminator": [
        71,
        136,
        87,
        127,
        213,
        117,
        241,
        1
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "response",
          "type": "string"
        }
      ]
    },
    {
      "name": "submitDelivery",
      "docs": [
        "Seller marks the work as delivered (link to files, tracking number, etc.)."
      ],
      "discriminator": [
        217,
        177,
        33,
        54,
        136,
        185,
        123,
        96
      ],
      "accounts": [
        {
          "name": "seller",
          "signer": true,
          "relations": [
            "deal"
          ]
        },
        {
          "name": "deal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "deal.seller",
                "account": "deal"
              },
              {
                "kind": "account",
                "path": "deal.deal_id",
                "account": "deal"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "deliveryNote",
          "type": "string"
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
        }
      ]
    }
  ],
  "accounts": [
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
      "name": "deal",
      "discriminator": [
        125,
        223,
        160,
        234,
        71,
        162,
        182,
        219
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
      "name": "dealCreated",
      "discriminator": [
        27,
        18,
        50,
        52,
        104,
        175,
        46,
        101
      ]
    },
    {
      "name": "dealFunded",
      "discriminator": [
        64,
        84,
        19,
        153,
        179,
        255,
        127,
        144
      ]
    },
    {
      "name": "dealSettled",
      "discriminator": [
        41,
        213,
        235,
        64,
        55,
        168,
        51,
        76
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "feeTooHigh",
      "msg": "Fee exceeds the 5% cap"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6002,
      "name": "invalidTitle",
      "msg": "Title must be 1-64 bytes"
    },
    {
      "code": 6003,
      "name": "textTooLong",
      "msg": "Text is empty or too long"
    },
    {
      "code": 6004,
      "name": "invalidDeadline",
      "msg": "Delivery deadline must be in the future"
    },
    {
      "code": 6005,
      "name": "invalidStatus",
      "msg": "Deal is not in the right state for this action"
    },
    {
      "code": 6006,
      "name": "sellerCannotBuy",
      "msg": "The seller cannot fund their own deal"
    },
    {
      "code": 6007,
      "name": "deadlinePassed",
      "msg": "The delivery deadline has passed"
    },
    {
      "code": 6008,
      "name": "deadlineNotReached",
      "msg": "The delivery deadline has not passed yet"
    },
    {
      "code": 6009,
      "name": "reviewPeriodActive",
      "msg": "The buyer's review period is still active"
    },
    {
      "code": 6010,
      "name": "unauthorized",
      "msg": "Signer is not allowed to perform this action"
    },
    {
      "code": 6011,
      "name": "alreadyResponded",
      "msg": "This dispute already has a response"
    },
    {
      "code": 6012,
      "name": "awaitingResponse",
      "msg": "Waiting for the other party to respond to the dispute"
    },
    {
      "code": 6013,
      "name": "invalidSplit",
      "msg": "Buyer share must be between 0 and 10000 bps"
    },
    {
      "code": 6014,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
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
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "deal",
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
            "name": "dealId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "deliveryDeadline",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "fundedAt",
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
                "name": "dealStatus"
              }
            }
          },
          {
            "name": "disputedBy",
            "type": "pubkey"
          },
          {
            "name": "buyerBps",
            "docs": [
              "Share of the escrow refunded to the buyer by the arbiter, in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "terms",
            "type": "string"
          },
          {
            "name": "deliveryNote",
            "type": "string"
          },
          {
            "name": "disputeReason",
            "type": "string"
          },
          {
            "name": "disputeResponse",
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
      "name": "dealCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
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
      "name": "dealFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "buyer",
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
      "name": "dealSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "deal",
            "type": "pubkey"
          },
          {
            "name": "toSeller",
            "type": "u64"
          },
          {
            "name": "toBuyer",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "dealStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "funded"
          },
          {
            "name": "delivered"
          },
          {
            "name": "disputed"
          },
          {
            "name": "completed"
          },
          {
            "name": "refunded"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "sellerProfile",
      "docs": [
        "Portable, on-chain reputation for a seller."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "dealsCreated",
            "type": "u64"
          },
          {
            "name": "dealsCompleted",
            "type": "u64"
          },
          {
            "name": "dealsRefunded",
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
            "name": "totalVolume",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
