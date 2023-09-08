import { Clarinet, Tx, Chain, Account, types, assertEquals } from "./deps.ts";
import { hexToBytes, expectHeaderObject, expectTxObject } from "./utils.ts";

Clarinet.test({
  name: "clarity-bitcoin can parse and verify tx",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;

    const b_hash = chain.callReadOnlyFn(
      "clarity-bitcoin",
      "get-bc-h-hash",
      [types.uint(801723)],
      deployer.address
    )
    console.log(b_hash);

    // https://mempool.space/api/tx/70796b5087799c71965a35d8a8add91f2fc14cab6baac6c58fd2c5fe48913611
    const deploy_data = "0x02000000000101df8ef516ae29b6f5320e6f7be966d134073fd608187de50c58821672e35896f00000000000fdffffff02220200000000000022512097c010ad464a48b77491113aded0570ce8b32090ba925b6290e5ba97268e3c7c1a0d000000000000160014b492459705c999f9c4ec329a815d3a32909cd880034022cf8cb19d3ae16f174dd965ea310bc03387e99bda8ff0cf6998f085687c0e6c03de7dbfab5b7dcfe0f48344b66cbbe23f4bb26e5ba39a7d814f2c684bddfe0f9b20117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423eac061234cf098801750063036f7264010118746578742f706c61696e3b636861727365743d7574662d38004c4c7b2270223a226272632d3230222c226f70223a226465706c6f79222c227469636b223a2224423230222c226d6178223a223231303030303030222c226c696d223a223231303030303030227d6821c0117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423e00000000";

    // https://mempool.space/api/tx/2e951004175cbc4a0a421efbb5a42aaa4e4708c1bc15a08ab03e41020336603b/hex
    const transferrable_data =
      "0x01000000000101885a283122b9897aa8ccfbd1b6ee8e88a81f297039506f1310ac0999fd0ec1c20000000000fdffffff01220200000000000022512053687745b1a04c2d74da5f1aa12d285df92626384fc5697de94ba6b9b9afee650340703b0cf0c88bd1e890d5b52a425cd37d4fa35e911423bf6306faeff09a98ff5c5afaf79fe02b5423771c2396abec0851af8d59896f5960b1869aa2d6323ea8927f2006449df0d86cb0c82057dfaa9dad498131215190799a442772d3407e0c0b02a7ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800397b2270223a226272632d3230222c226f70223a227472616e73666572222c227469636b223a2269676c69222c22616d74223a2232303030227d6821c106449df0d86cb0c82057dfaa9dad498131215190799a442772d3407e0c0b02a700000000";

    // https://mempool.space/api/tx/5760346ab0ebb18084432eea1c8f921f36e2517e0e3fea9741a1523cd5e47feb/hex
    const transfer_data =
      "0x020000000001023b60360302413eb08aa015bcc108474eaa2aa4b5fb1e420a4abc5c170410952e0000000000ffffffffad4836f6077e2a02a2ac0198a70374759f8fece545d2c0e12b5ba9ca9efc3fc50400000017160014770dea24279344035fbb90eab3a156b43c183decffffffff022202000000000000225120c981bdfa5eaab9d6d0da158144e1c519411e76bf11e4c5deba73b358431b53b70a7300000000000017a914fe8b7a0c78c3af44ceea9e2b033d9220631ecf9e8701401442fa68d11c85791ffd3a7efa5ceedaa4bb51ee280c0b428f4ce2c6041261a1bee22084c073efff332d6264db9e84533d8aed41ddaee96cb166fdbb70a634f802483045022100eedf43522e4fb9c7c8aa1daddf31f2f48aaefb0741a14d5b1dc390420b8bca2c02207718fe6f3dfd1291bc4cafd6ef73c58237df20528737029dd15f35d18d611ef6012103f7cefdc7515124973cb02a6f17704e254e08f6025636e68f43ebee86fe3c724100000000";

    const transferrable_parsed = chain
      .callReadOnlyFn(
        "clarity-bitcoin",
        "parse-wtx",
        [transferrable_data],
        deployer.address
      )
      .result.expectOk()
      .expectTuple();
    const transfer_parsed = chain
      .callReadOnlyFn(
        "clarity-bitcoin",
        "parse-wtx",
        [transfer_data],
        deployer.address
      )
      .result.expectOk()
      .expectTuple();

    // const deploy_burn_height = 789219;
    // const deploy_block_header = "0x000099247386511af242d00e8ee3773996d90c293e0b8e3974ba0500000000000000000050ae942b1b7052581eff46d43d26d4133cc3ce9a7be1cbb81318c27b54cf27099d9f5c6401dd051722911240";

    const transferrable_burn_height = 794680;
    const transferrable_block_header =
      "0x0040002094c612a35b16f031dc589dccef93a671e763e00efc6c02000000000000000000f42688ac3b24036b38263f73f1ba1ae5924057fe8a6390b25e8b367f2fe0f53bf3f68c646d6005179da8a102";

    // const transfer_burn_height = 794819;
    // const transfer_block_header = "0x00000020aeb0b24d2d6a052c12063dce70db5cef3b32d4b2feed00000000000000000000f4f2231eacd683f14838228cc7d4221f4a86f163ba5f0e35f94b35d2f0a72062d63e8e646d600517382e2a5c";


    const inscribe_header_hash = chain.callReadOnlyFn(
      "clarity-bitcoin",
      "get-txid",
      [transferrable_block_header],
      deployer.address
    ).result;
    let block = chain.mineBlock([
      Tx.contractCall(
        "clarity-bitcoin",
        "mock-add-burnchain-block-header-hash",
        [types.uint(transferrable_burn_height), inscribe_header_hash],
        deployer.address
      ),
    ]);
    block.receipts.map(e => { e.result.expectOk() });

    console.log(
      `can get classic txid of segwit tx: ${chain.callReadOnlyFn(
        "clarity-bitcoin",
        "get-segwit-txid",
        [transferrable_data],
        deployer.address
      ).result}`
    );
    console.log(
      `can get wtxid of segwit tx: ${chain.callReadOnlyFn(
        "clarity-bitcoin",
        "get-txid",
        [transferrable_data],
        deployer.address
      ).result}`
    );

    console.log(
      `can verify block header: ${chain.callReadOnlyFn(
        "clarity-bitcoin",
        "verify-block-header",
        [transferrable_block_header, types.uint(transferrable_burn_height)],
        deployer.address
      ).result}`
    );

    console.log(
      `can verify if segwit tx was mined ${chain.callReadOnlyFn(
        "clarity-bitcoin",
        "was-segwit-tx-mined?",
        [
          types.tuple({
            header: transferrable_block_header,
            height: types.uint(transferrable_burn_height),
          }),
          transferrable_data,
          types.tuple({
            "tx-index": types.uint(382),
            hashes: types.list([
              "0x417dbc049f86e060b862073054469b9da9bc92e6a8f39d94c0344f4e1355e3b4",
              "0x1a92bb4b9d4d821ea26b33503a24f132d8ac49cf085543a28da684f32b3d197b",
              "0x6e19bc2d92439878adb32a0298191fac2fc05781ca5f3e266fcb2b588b20e3c9",
              "0xb5ccdf94b47093853aeb465170a51be66b92c1043ae120552ff5eb191d522c50",
              "0x15434283b374b5e4289e4f4aa44b1321b5db03747139d7cabcf4c611eb941f53",
              "0xa4def5491336a883410b653ec91162acf4bfe853e2a6287ad6d6f4337f9a60bb",
              "0xa969dde4d0c97d87a2b9704344127aaeb26a1678897632f31610bfd8dd5d8d77",
              "0x504461d569bd51ab1c8c51ee1e834fe19fd5936fb6a9aaecfb348fb2926436c3",
              "0x460b473528cc1e9306c8a316add3260ea2339bc43de8dfebfb69448394911f95",
              "0xc7aef7e665ec086443a282d1fff887f43ebd79728b6a2dbe4b18d7635f0793bf",
              "0xd383fbfea7f4268208cbc92e3ae879eb6b4b3cc323bafb5185426c3decb593dd",
              "0x5f33844bff468cb7f0d5104ce9c5c266b0b125db2e5f8b55458a8c66d9487192",
            ]),
            "tree-depth": types.uint(12),
          }),
        ],
        deployer.address
      ).result}`
    );
  }
});

Clarinet.test({
  name: "indexer can hash, validate and index",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const relayer = accounts.get("wallet_1")!;

    const tx = {
      amt: types.uint(5000000000000000000n),
      "bitcoin-tx": '0x0724f2a8b3c7baf69ed90e0c23c909c350cad04c139c1fde56181f72cc35091c',
      output: types.uint(0),
      offset: types.uint(0),
      tick: types.utf8('yari'),
      from: '0x5120279652ef2b9cca3cad2f1aee8ccf3bfd65f072ade8af837d6c1bdcc4ff197636',
      to: '0x5120da2cee6145154c03c7507e4bbe574ffbea1b7efd154941c47a0f1cb406cd2409',
      "from-bal": types.uint(15000000000000000000n),
      "to-bal": types.uint(24000000000000000000n)
    };
    const bitcoinBlock = {
      header: '0x0000d02c2279577963d4051f49d2c6b63701811cd2064eb3a3e1010000000000000000001d64bce2fd969dd1932d6b1fa97a261cce58758cb4c91dce9960ef3d7f5a6e3c2240c0649438051716d99b0e',
      height: types.uint(800258)
    };
    const bitcoinProof = {
      hashes: types.list([
        '0x19d017b157aab7df829f231ff050dddec65e5f331a7d12a53acab229381b82f3',
        '0xd59a1af2820a8f0b26ae9acc2add83909afcb777bb9f547b94afb52ab8ea3aa4',
        '0x7bed64d27dc371e40760c096405920efd6c064d8aad2c2b7780b0080709ecd1f',
        '0x8622ba1d8e890d12a48179539fabf5bc7eb7bc4bc3efd4248e1a906ff146fc29',
        '0xd4d596cdf3e2842ff4d62a96ab9bc4e5be7cb89855a1ac7e0872468a0e9fd206',
        '0x103c3c4fea3ec14f44899f7296bfc23ff8b1ddf1ccd40b8073e2f3eb693bbdd0',
        '0x66997c930850113d6abab3c7d455125dec7e751521b3e11d6d5cbf829ac2aac8',
        '0xe3c36d6c2d2854593f3e1bd32ca022a48b4f265fc34b262c6da62802ff06717b',
        '0x5cc55c2ed31a6f111b27c04cc1b352a1235cccd05031045be8d1df209dcc1a20',
        '0x5f965388b8cf20280216360e9902cdfd5ca05109c3231cb32f7ff1c1f41f3816',
        '0xbeb12810cbdd3bc16505a506da562b64bde7fb6ffafef07444cd9ee4a09f6e75',
        '0x503bba3faf83a4b896637f075add0ea72056b0ca51f1df016cd445df85d9302b'
      ]),
      "tree-depth": types.uint(12),
      "tx-index": types.uint(1261)
    };
    const txHash = '0x361780849133cdc391e344e43abd694b002aa15860bd1ed814225c74d9bf600b';
    const signaturePack = {
      signature: '0x0455e1bd4bc02a79f4c16613c0be94cdd0929e148f6e867742426126c7648df57cf840eb586fb436bd9a01bd2d7ba8528c7dd737aff4886a0e852ea304fbfd8700',
      signer: types.principal('SP1B0DHZV858RCBC8WG1YN5W9R491MJK88QPPC217'),
      "tx-hash": txHash
    };

    let block = chain.mineBlock([
      Tx.contractCall(
        "indexer-registry",
        "approve-operator",
        [types.principal('.indexer'), types.bool(true)],
        deployer.address
      ),
      Tx.contractCall(
        "indexer",
        "set-paused",
        [types.bool(true)],
        deployer.address
      ),
      Tx.contractCall(
        "indexer",
        "set-required-validators",
        [types.uint(1)],
        deployer.address
      ),
      Tx.contractCall(
        "indexer",
        "add-validator",
        [
          '0x02883d08893252a59cf25aafffe1417bf74a7526621665a4bc0060e4aa95405891',
          types.principal('SP1B0DHZV858RCBC8WG1YN5W9R491MJK88QPPC217')
        ],
        deployer.address
      ),
      Tx.contractCall(
        "indexer",
        "approve-relayer",
        [
          types.principal(relayer.address)
        ],
        deployer.address
      )
    ]);
    block.receipts.map(e => { e.result.expectOk() });

    const hashed = chain.callReadOnlyFn("indexer", "hash-tx", [types.tuple(tx)], deployer.address).result;
    assertEquals(hashed, txHash);
    console.log(`can hash tx correctly: ${hashed == txHash}`);

    console.log(
      `can validate tx: ${chain.callReadOnlyFn("indexer", "validate-tx", [txHash, types.tuple(signaturePack)], deployer.address).result}`
    );

    block = chain.mineBlock([
      Tx.contractCall(
        "indexer",
        "index-tx-many",
        [
          types.list([
            types.tuple({
              block: types.tuple(bitcoinBlock),
              proof: types.tuple(bitcoinProof),
              "signature-packs": types.list([types.tuple({ ...signaturePack, tx: tx })])
            })
          ])
        ],
        relayer.address
      ),
    ]);
    block.receipts.map(e => { e.result.expectOk() });
  },
});
