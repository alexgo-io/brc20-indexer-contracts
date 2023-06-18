import { Clarinet, Tx, Chain, Account, types, assertEquals } from "./deps.ts";
import { hexToBytes, expectHeaderObject, expectTxObject } from "./utils.ts";

Clarinet.test({
  name: "Ensure that witness can be parsed",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    let block = chain.mineBlock([
        Tx.contractCall('clarity-bitcoin', 'parse-tx', [
            "0x02000000000101da5114853a41ad1b3cb260d9c0b24b196c804c7de5c09a78fa37660889613f440000000000fdffffff022202000000000000160014f2ab337a87c0d96265f14273697b92c8cefbb33da708000000000000160014f791d4cd3f950f947356f0542afd2d3c8da359c9034060c268ad3f1256742ce1b18f8fdf9218790401fe192e1b8d1623a8cfdee0bd32ae392728b838ed7139b362c692e5d02d70ef4960a2d2acf69ee230bb0847fdd88620117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423eac068d537fc48801750063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800387b2270223a226272632d3230222c226f70223a227472616e73666572222c227469636b223a22564d5058222c22616d74223a22343830227d6821c1117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423e00000000"            
            // "0x01000000000102ba8d80d45493fadb983c29cfa1ade8682eda3caa9d5b23dfe2becc36bc3f72278d05000000fffffffffe738ee16d92b098f46f4efe9a7c0d5f81ec2b1168cb187bfe9cabfbb8da94b0010000006b483045022100ad345c31674a9912699e402a3d4965c2a94cd5dd66d58a3a137bff315593903b02206cc1ab31a94ebee18130ea947a7fd954b4a8a8f4e170be746dffaf4203aad167012102e36971247bef3a8612e1ae2ddd573e171e707da843d1803370b2b86be41fab37ffffffff0240420f00000000001976a9141abc4d2c4d35ac00866d88b404e961a11a1017bd88aca94b0000000000001976a914a0a84aeb51e736a831ab275dd4cb71c5c28392ae88ac0247304402206af997ff413b7ac49553c8729ef65ed1246ff7cafc1c5f80a9960d8b1acb018e02203f9beb0ecb7c0a71afe8d0f505231044ba6e0e0c295b2bb31a95dda8cae14b960121030fc54ce5a2d2f26e482180df1b088039bbe9c444315c29e2c94a1d7f51d746760000000000"
        ], deployer.address)
    ]);

    const resultTxObject = block.receipts[0].result.expectOk().expectTuple();
    console.log(resultTxObject.witnesses);

    // expectTxObject(block, {
    //   version: 1,
    //   segwitMarker: 0,
    //   segwitVersion: 1,
    //   ins: [
    //     {
    //       outpoint: {
    //         hash: "27723fbc36ccbee2df235b9daa3cda2e68e8ada1cf293c98dbfa9354d4808dba",
    //         index: 1421,
    //       },
    //       scriptSig: "",
    //       sequence: 4294967295,
    //     },
    //     {
    //       outpoint: {
    //         hash: "b094dab8fbab9cfe7b18cb68112bec815f0d7c9afe4e6ff498b0926de18e73fe",
    //         index: 1,
    //       },
    //       scriptSig: "483045022100ad345c31674a9912699e402a3d4965c2a94cd5dd66d58a3a137bff315593903b02206cc1ab31a94ebee18130ea947a7fd954b4a8a8f4e170be746dffaf4203aad167012102e36971247bef3a8612e1ae2ddd573e171e707da843d1803370b2b86be41fab37",
    //       sequence: 4294967295,
    //     },
    //   ],
    //   outs: [
    //     {
    //       scriptPubKey: "76a9141abc4d2c4d35ac00866d88b404e961a11a1017bd88ac",
    //       value: 1000000,
    //     },
    //     {
    //       scriptPubKey: "76a914a0a84aeb51e736a831ab275dd4cb71c5c28392ae88ac",
    //       value: 19369,
    //     },
    //   ],
    //   witnesses: [
    //     ["304402206af997ff413b7ac49553c8729ef65ed1246ff7cafc1c5f80a9960d8b1acb018e02203f9beb0ecb7c0a71afe8d0f505231044ba6e0e0c295b2bb31a95dda8cae14b9601", "030fc54ce5a2d2f26e482180df1b088039bbe9c444315c29e2c94a1d7f51d74676"],
    //     []
    //   ],
    //   locktime: 0,
    // });
  },
});