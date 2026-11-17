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
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98,
                  109,
                  105,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bounty"
              },
              {
                "kind": "account",
                "path": "hunter"
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
        },
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
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
      "name": "reclaimSubmission",
      "discriminator": [
        206,
        188,
        132,
        90,
        194,
        200,
        50,
        143
      ],
      "accounts": [
        {
          "name": "hunter",
          "writable": true,
          "signer": true
        },
        {
          "name": "bounty",
          "docs": [
            "After accept/cancel/expire the bounty account is closed."
          ],
          "writable": true
        },
        {
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98,
                  109,
                  105,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bounty"
              },
              {
                "kind": "account",
                "path": "hunter"
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
          "name": "submission",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  117,
                  98,
                  109,
                  105,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "bounty"
              },
              {
                "kind": "account",
                "path": "hunter"
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
      "name": "submission",
      "discriminator": [
        58,
        194,
        159,
        158,
        75,
        102,
        178,
        197
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
      "msg": "Bounty has no submissions to accept"
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
      "msg": "Submission URI is too long or empty"
    },
    {
      "code": 6009,
      "name": "invalidTitle",
      "msg": "Title is empty or too long"
    },
    {
      "code": 6010,
      "name": "invalidDescription",
      "msg": "Description is empty or too long"
    },
    {
      "code": 6011,
      "name": "invalidSubmission",
      "msg": "Submission account does not match hunter and bounty"
    },
    {
      "code": 6012,
      "name": "bountyStillOpen",
      "msg": "Cannot reclaim while the bounty is still open"
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
            "name": "submissionCount",
            "type": "u32"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "description",
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
      "name": "submission",
      "docs": [
        "One submission per hunter for a given bounty."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bounty",
            "type": "pubkey"
          },
          {
            "name": "hunter",
            "type": "pubkey"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
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
      "name": "submissionSeed",
      "type": "bytes",
      "value": "[115, 117, 98, 109, 105, 115, 115, 105, 111, 110]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
