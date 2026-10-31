/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bounty_board.json`.
 */
export type BountyBoard = {
  "address": "5rL8PzKb61y7VxB5ML1uWMTgqv2kUAA1qkUMoY6Xpm8y",
  "metadata": {
    "name": "bountyBoard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "accept",
      "discriminator": [
        65,
        150,
        70,
        216,
        133,
        6,
        107,
        4
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "bounty"
          ]
        },
        {
          "name": "hunter",
          "writable": true
        },
        {
          "name": "bounty",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  117,
                  110,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "bounty.bountyId",
                "account": "bounty"
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
                "path": "bounty"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "bounty"
          ]
        },
        {
          "name": "bounty",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  117,
                  110,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "bounty.bountyId",
                "account": "bounty"
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
                "path": "bounty"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createBounty",
      "discriminator": [
        122,
        90,
        14,
        143,
        8,
        125,
        200,
        2
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "bounty",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  117,
                  110,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "bountyId"
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
                "path": "bounty"
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
          "name": "bountyId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        }
      ]
    },
    {
      "name": "expireRefund",
      "discriminator": [
        254,
        82,
        2,
        76,
        59,
        107,
        145,
        112
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone can trigger expiry after the deadline."
          ],
          "signer": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "bounty",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  117,
                  110,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "bounty.creator",
                "account": "bounty"
              },
              {
                "kind": "account",
                "path": "bounty.bountyId",
                "account": "bounty"
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
                "path": "bounty"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "submitWork",
      "discriminator": [
        158,
        80,
        101,
        51,
        114,
        130,
        101,
        253
      ],
      "accounts": [
        {
          "name": "hunter",
          "signer": true
        },
        {
          "name": "bounty",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  117,
                  110,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "bounty.creator",
                "account": "bounty"
              },
              {
                "kind": "account",
                "path": "bounty.bountyId",
                "account": "bounty"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "submissionUri",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bounty",
      "discriminator": [
        237,
        16,
        105,
        198,
        19,
        69,
        242,
        234
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "invalidDeadline",
      "msg": "Deadline must be in the future"
    },
    {
      "code": 6002,
      "name": "notOpen",
      "msg": "Bounty is not open for submissions"
    },
    {
      "code": 6003,
      "name": "noSubmission",
      "msg": "Bounty has no active submission"
    },
    {
      "code": 6004,
      "name": "unauthorizedCreator",
      "msg": "Only the bounty creator can perform this action"
    },
    {
      "code": 6005,
      "name": "cannotCancel",
      "msg": "Bounty cannot be cancelled in its current state"
    },
    {
      "code": 6006,
      "name": "deadlineNotReached",
      "msg": "Deadline has not passed yet"
    },
    {
      "code": 6007,
      "name": "cannotExpire",
      "msg": "Bounty is not eligible for expiry refund"
    },
    {
      "code": 6008,
      "name": "uriTooLong",
      "msg": "Submission URI is too long"
    }
  ],
  "types": [
    {
      "name": "bounty",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "bountyId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "bountyStatus"
              }
            }
          },
          {
            "name": "hunter",
            "type": "pubkey"
          },
          {
            "name": "submissionUri",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bountyStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "submitted"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "vault",
      "docs": [
        "Empty program-owned account that holds escrowed SOL."
      ],
      "type": {
        "kind": "struct",
        "fields": []
      }
    }
  ],
  "constants": [
    {
      "name": "bountySeed",
      "type": "bytes",
      "value": "[98, 111, 117, 110, 116, 121]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
