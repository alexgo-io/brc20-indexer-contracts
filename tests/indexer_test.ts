import { Clarinet, Tx, Chain, Account, types, assertEquals } from "./deps.ts";
import { hexToBytes, expectHeaderObject, expectTxObject } from "./utils.ts";

Clarinet.test({
  name: "Ensure that indexer can verify inscription and transfer",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;

    // // https://mempool.space/api/tx/70796b5087799c71965a35d8a8add91f2fc14cab6baac6c58fd2c5fe48913611
    // const deploy_data = "0x02000000000101df8ef516ae29b6f5320e6f7be966d134073fd608187de50c58821672e35896f00000000000fdffffff02220200000000000022512097c010ad464a48b77491113aded0570ce8b32090ba925b6290e5ba97268e3c7c1a0d000000000000160014b492459705c999f9c4ec329a815d3a32909cd880034022cf8cb19d3ae16f174dd965ea310bc03387e99bda8ff0cf6998f085687c0e6c03de7dbfab5b7dcfe0f48344b66cbbe23f4bb26e5ba39a7d814f2c684bddfe0f9b20117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423eac061234cf098801750063036f7264010118746578742f706c61696e3b636861727365743d7574662d38004c4c7b2270223a226272632d3230222c226f70223a226465706c6f79222c227469636b223a2224423230222c226d6178223a223231303030303030222c226c696d223a223231303030303030227d6821c0117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423e00000000";

    // // https://mempool.space/api/tx/2e951004175cbc4a0a421efbb5a42aaa4e4708c1bc15a08ab03e41020336603b/hex
    // const transferrable_data =
    //   "0x01000000000101885a283122b9897aa8ccfbd1b6ee8e88a81f297039506f1310ac0999fd0ec1c20000000000fdffffff01220200000000000022512053687745b1a04c2d74da5f1aa12d285df92626384fc5697de94ba6b9b9afee650340703b0cf0c88bd1e890d5b52a425cd37d4fa35e911423bf6306faeff09a98ff5c5afaf79fe02b5423771c2396abec0851af8d59896f5960b1869aa2d6323ea8927f2006449df0d86cb0c82057dfaa9dad498131215190799a442772d3407e0c0b02a7ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800397b2270223a226272632d3230222c226f70223a227472616e73666572222c227469636b223a2269676c69222c22616d74223a2232303030227d6821c106449df0d86cb0c82057dfaa9dad498131215190799a442772d3407e0c0b02a700000000";

    // // https://mempool.space/api/tx/5760346ab0ebb18084432eea1c8f921f36e2517e0e3fea9741a1523cd5e47feb/hex
    // const transfer_data =
    //   "0x020000000001023b60360302413eb08aa015bcc108474eaa2aa4b5fb1e420a4abc5c170410952e0000000000ffffffffad4836f6077e2a02a2ac0198a70374759f8fece545d2c0e12b5ba9ca9efc3fc50400000017160014770dea24279344035fbb90eab3a156b43c183decffffffff022202000000000000225120c981bdfa5eaab9d6d0da158144e1c519411e76bf11e4c5deba73b358431b53b70a7300000000000017a914fe8b7a0c78c3af44ceea9e2b033d9220631ecf9e8701401442fa68d11c85791ffd3a7efa5ceedaa4bb51ee280c0b428f4ce2c6041261a1bee22084c073efff332d6264db9e84533d8aed41ddaee96cb166fdbb70a634f802483045022100eedf43522e4fb9c7c8aa1daddf31f2f48aaefb0741a14d5b1dc390420b8bca2c02207718fe6f3dfd1291bc4cafd6ef73c58237df20528737029dd15f35d18d611ef6012103f7cefdc7515124973cb02a6f17704e254e08f6025636e68f43ebee86fe3c724100000000";

    // const transferrable_parsed = chain
    //   .callReadOnlyFn(
    //     "clarity-bitcoin",
    //     "parse-wtx",
    //     [transferrable_data],
    //     deployer.address
    //   )
    //   .result.expectOk()
    //   .expectTuple();
    // const transfer_parsed = chain
    //   .callReadOnlyFn(
    //     "clarity-bitcoin",
    //     "parse-wtx",
    //     [transfer_data],
    //     deployer.address
    //   )
    //   .result.expectOk()
    //   .expectTuple();
    // // const deploy_parsed = chain.callReadOnlyFn('clarity-bitcoin', 'parse-wtx', [transferrable_data], deployer.address).result.expectOk().expectTuple();
    // // const inscription_encoded = deploy_parsed.witnesses.expectList()[0].expectList()[1];
    // // console.log(inscription_encoded.slice(140,254));
    // // console.log(inscription_encoded.slice(158,310));
    // // console.log(deploy_parsed.result);

    // const deploy_burn_height = 789219;
    // const deploy_block_header = "0x000099247386511af242d00e8ee3773996d90c293e0b8e3974ba0500000000000000000050ae942b1b7052581eff46d43d26d4133cc3ce9a7be1cbb81318c27b54cf27099d9f5c6401dd051722911240";

    // const transferrable_burn_height = 794680;
    // const transferrable_block_header =
    //   "0x0040002094c612a35b16f031dc589dccef93a671e763e00efc6c02000000000000000000f42688ac3b24036b38263f73f1ba1ae5924057fe8a6390b25e8b367f2fe0f53bf3f68c646d6005179da8a102";

    // const transfer_burn_height = 794819;
    // const transfer_block_header = "0x00000020aeb0b24d2d6a052c12063dce70db5cef3b32d4b2feed00000000000000000000f4f2231eacd683f14838228cc7d4221f4a86f163ba5f0e35f94b35d2f0a72062d63e8e646d600517382e2a5c";


    // const inscribe_header_hash = chain.callReadOnlyFn(
    //   "clarity-bitcoin",
    //   "get-txid",
    //   [transferrable_block_header],
    //   deployer.address
    // ).result;
    // const transfer_header_hash = chain.callReadOnlyFn(
    //   "clarity-bitcoin",
    //   "get-txid",
    //   [transfer_block_header],
    //   deployer.address
    // ).result;
    // const deploy_header_hash = chain.callReadOnlyFn("clarity-bitcoin", "get-txid", [deploy_block_header], deployer.address).result;
    // let block = chain.mineBlock([
    //   Tx.contractCall(
    //     "clarity-bitcoin",
    //     "mock-add-burnchain-block-header-hash",
    //     [types.uint(transferrable_burn_height), inscribe_header_hash],
    //     deployer.address
    //   ),
    //   Tx.contractCall(
    //     "clarity-bitcoin",
    //     "mock-add-burnchain-block-header-hash",
    //     [types.uint(transfer_burn_height), transfer_header_hash],
    //     deployer.address
    //   ),
    //   Tx.contractCall(
    //     "clarity-bitcoin",
    //     "mock-add-burnchain-block-header-hash",
    //     [types.uint(deploy_burn_height), deploy_header_hash],
    //     deployer.address
    //   ),
    //   Tx.contractCall(
    //     "indexer",
    //     "set-tick-info",
    //     [types.utf8("igli"), types.uint(21000000), types.uint(1000)],
    //     deployer.address
    //   ),
    //   Tx.contractCall(
    //     "indexer",
    //     "set-user-balance",
    //     ["0x512053687745b1a04c2d74da5f1aa12d285df92626384fc5697de94ba6b9b9afee65", types.utf8("igli"), types.uint(0), types.uint(100000)],
    //     deployer.address
    //   )
    // ]);
    // block.receipts.map(e => { e.result.expectOk() });

    // console.log(
    //   `can get classic txid of segwit tx: ${chain.callReadOnlyFn(
    //     "clarity-bitcoin",
    //     "get-segwit-txid",
    //     [transferrable_data],
    //     deployer.address
    //   ).result}`
    // );
    // console.log(
    //   `can get wtxid of segwit tx: ${chain.callReadOnlyFn(
    //     "clarity-bitcoin",
    //     "get-txid",
    //     [transferrable_data],
    //     deployer.address
    //   ).result}`
    // );

    // console.log(
    //   `can verify block header: ${chain.callReadOnlyFn(
    //     "clarity-bitcoin",
    //     "verify-block-header",
    //     [transferrable_block_header, types.uint(transferrable_burn_height)],
    //     deployer.address
    //   ).result}`
    // );

    // console.log(
    //   `can verify if segwit tx was mined ${chain.callReadOnlyFn(
    //     "clarity-bitcoin",
    //     "was-segwit-tx-mined?",
    //     [
    //       types.tuple({
    //         header: transferrable_block_header,
    //         height: types.uint(transferrable_burn_height),
    //       }),
    //       transferrable_data,
    //       types.tuple({
    //         "tx-index": types.uint(382),
    //         hashes: types.list([
    //           "0x417dbc049f86e060b862073054469b9da9bc92e6a8f39d94c0344f4e1355e3b4",
    //           "0x1a92bb4b9d4d821ea26b33503a24f132d8ac49cf085543a28da684f32b3d197b",
    //           "0x6e19bc2d92439878adb32a0298191fac2fc05781ca5f3e266fcb2b588b20e3c9",
    //           "0xb5ccdf94b47093853aeb465170a51be66b92c1043ae120552ff5eb191d522c50",
    //           "0x15434283b374b5e4289e4f4aa44b1321b5db03747139d7cabcf4c611eb941f53",
    //           "0xa4def5491336a883410b653ec91162acf4bfe853e2a6287ad6d6f4337f9a60bb",
    //           "0xa969dde4d0c97d87a2b9704344127aaeb26a1678897632f31610bfd8dd5d8d77",
    //           "0x504461d569bd51ab1c8c51ee1e834fe19fd5936fb6a9aaecfb348fb2926436c3",
    //           "0x460b473528cc1e9306c8a316add3260ea2339bc43de8dfebfb69448394911f95",
    //           "0xc7aef7e665ec086443a282d1fff887f43ebd79728b6a2dbe4b18d7635f0793bf",
    //           "0xd383fbfea7f4268208cbc92e3ae879eb6b4b3cc323bafb5185426c3decb593dd",
    //           "0x5f33844bff468cb7f0d5104ce9c5c266b0b125db2e5f8b55458a8c66d9487192",
    //         ]),
    //         "tree-depth": types.uint(12),
    //       }),
    //     ],
    //     deployer.address
    //   ).result}`
    // );

    // const verify_deploy_input = [
    //   deploy_data,
    //   types.uint(78),
    //   types.uint(154),
    //   types.utf8("$B20"),
    //   types.uint(21000000),
    //   types.uint(21000000),
    //   types.tuple({
    //     header: deploy_block_header,
    //     height: types.uint(deploy_burn_height)
    //   }),
    //   types.tuple({
    //     "tx-index": types.uint(603),
    //     hashes: types.list([
    //       '0xa1f6564581a409bf3d52c87ea8164e0899d20df9c946af2794d4b408a10a86d9',
    //       '0x5ee7f8ae5576636d2b36540164b12a8c7f171a382e92b3313c999c022ad62b59',
    //       '0xe95ccfd8da89610069cd08dca041ac587bace26880a1f6b3847ff56c78068b06',
    //       '0x1b239752cb61b6dbd6726795af70e7a2cdaee3929c51a1f655417fc22ebd3c0a',
    //       '0x0b7bb231b7e8a6bb4cf4967444efd4f28ae95370781e634dba7273016f488fcf',
    //       '0x5af25cccb1eead88515d34e068f19e9d1f5d1a7d33ce4f5d1ada6d92364ce3dc',
    //       '0xbee7d7710e557deb14cf7961c19c981afb70ffc307c1695c24362eaf37e5cd0c',
    //       '0xebac6ae575e22cdb63847931454d8ca828c6cae6ec85b2aab35c32057133d354',
    //       '0xd6a106be86e0b533bd7459c589b0abd317fa6fe84bd83676188a2bf493a10093',
    //       '0x65a68bc14a6555d287ce799659ca0b3225df9df5dbf18992763267d5852637e4',
    //       '0x462e3648c61f1e3033d009e3447ad5cba5d85be96c7525e8cef391a6c9170e6f',
    //       '0x4fb85cf869308cd73f73258a9d10f5e07da27cf54b2d49290ab0b85476f42e57',
    //       '0x0cab2ef841bbd34607ff152fa4fdd7dc33b06cd34a8a21cd91bf0321a3c60f0a'
    //     ]),
    //     "tree-depth": types.uint(13)
    //   })
    // ];

    // const verify_transferrable_input = [
    //   transferrable_data,
    //   types.uint(69),
    //   types.uint(126),
    //   types.utf8("igli"),
    //   types.uint(2000),
    //   types.tuple({
    //     header: transferrable_block_header,
    //     height: types.uint(transferrable_burn_height),
    //   }),
    //   types.tuple({
    //     "tx-index": types.uint(382),
    //     hashes: types.list([
    //       "0x417dbc049f86e060b862073054469b9da9bc92e6a8f39d94c0344f4e1355e3b4",
    //       "0x1a92bb4b9d4d821ea26b33503a24f132d8ac49cf085543a28da684f32b3d197b",
    //       "0x6e19bc2d92439878adb32a0298191fac2fc05781ca5f3e266fcb2b588b20e3c9",
    //       "0xb5ccdf94b47093853aeb465170a51be66b92c1043ae120552ff5eb191d522c50",
    //       "0x15434283b374b5e4289e4f4aa44b1321b5db03747139d7cabcf4c611eb941f53",
    //       "0xa4def5491336a883410b653ec91162acf4bfe853e2a6287ad6d6f4337f9a60bb",
    //       "0xa969dde4d0c97d87a2b9704344127aaeb26a1678897632f31610bfd8dd5d8d77",
    //       "0x504461d569bd51ab1c8c51ee1e834fe19fd5936fb6a9aaecfb348fb2926436c3",
    //       "0x460b473528cc1e9306c8a316add3260ea2339bc43de8dfebfb69448394911f95",
    //       "0xc7aef7e665ec086443a282d1fff887f43ebd79728b6a2dbe4b18d7635f0793bf",
    //       "0xd383fbfea7f4268208cbc92e3ae879eb6b4b3cc323bafb5185426c3decb593dd",
    //       "0x5f33844bff468cb7f0d5104ce9c5c266b0b125db2e5f8b55458a8c66d9487192",
    //     ]),
    //     "tree-depth": types.uint(12),
    //   })
    // ];

    // const verify_transferrable = chain
    //   .callReadOnlyFn(
    //     "indexer",
    //     "verify-transferrable",
    //     verify_transferrable_input,
    //     deployer.address
    //   )
    //   .result.expectOk()
    //   .expectTuple();
    // console.log(`can verify inscription mined ${verify_transferrable.txid}`);

    // const transfer_input = [
    //   transfer_data,
    //   verify_transferrable.txid,
    //   verify_transferrable.owner,
    //   "0x5120c981bdfa5eaab9d6d0da158144e1c519411e76bf11e4c5deba73b358431b53b7",
    //   types.tuple({
    //     header: transfer_block_header,
    //     height: types.uint(transfer_burn_height),
    //   }),
    //   types.tuple({
    //     "tx-index": types.uint(1151),
    //     hashes: types.list([
    //       '0x55d4e980d84c3c31f3b9538dcf56a4bf8a11ec280175f3a8b96e32e255dc7e3c',
    //       '0x52a0646be2f03c64108eee7948f8ac3fa0add274ac06e5756d8ff585e1d25481',
    //       '0x572ce337af6f2777b1266d6cfc5860a62b5821cc494b5c867e136a0464dae744',
    //       '0x578abb65f25709c21232dd2ac13e1e89fc97f1b1c06404a4d97321720500c38b',
    //       '0x015458b49f57c7d35d23e48b0a821d7def627d3716e31e29a645ac0b4d96253e',
    //       '0xe85afa448d20154aa410e95658ee31d1732930817b8659b35b0c9ecf3095ca5a',
    //       '0xf0d3a992cc972edf0db390cf97e55e7e8fb0a4e08f10c236ba5dbb5e4174bb80',
    //       '0x24ff2881c0dfb8f2fcd4d88582bdc0cce1b8997ed074b06a7da7260f7831b46c',
    //       '0xefadcaddbc4b6832a1b553d40736636b0de91a81996a1c66feddd84a59849f6f',
    //       '0x9b8e5adaa212bd9538af596692e33f5a78b5023d34787c051a9efe35b208932f',
    //       '0xc981bdb80b48bcd489d4974240607186b1de49e4b52819ace0f45f623586fdde',
    //       '0x359a0995c03c1c2b961122f770fcfe8ecd9095bb94eb98111139848badee2891'
    //     ]),
    //     "tree-depth": types.uint(12),
    //   })
    // ];

    // block = chain.mineBlock([
    //   Tx.contractCall(
    //     "indexer",
    //     "inscribe-deploy",
    //     verify_deploy_input,
    //     deployer.address
    //   ),
    //   Tx.contractCall(
    //     "indexer",
    //     "inscribe-transfer",
    //     verify_transferrable_input,
    //     deployer.address
    //   ),
    //   Tx.contractCall("indexer", "transfer", transfer_input, deployer.address),
    // ]);
    // block.receipts.map(e => { e.result.expectOk() });
  },
});
