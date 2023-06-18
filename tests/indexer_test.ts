import { Clarinet, Tx, Chain, Account, types, assertEquals } from "./deps.ts";
import { hexToBytes, expectHeaderObject, expectTxObject } from "./utils.ts";

Clarinet.test({
  name: "Ensure that witness can be parsed",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;

    console.log((chain.callReadOnlyFn('indexer', 'verify-tx', [
      "0x02000000000101da5114853a41ad1b3cb260d9c0b24b196c804c7de5c09a78fa37660889613f440000000000fdffffff022202000000000000160014f2ab337a87c0d96265f14273697b92c8cefbb33da708000000000000160014f791d4cd3f950f947356f0542afd2d3c8da359c9034060c268ad3f1256742ce1b18f8fdf9218790401fe192e1b8d1623a8cfdee0bd32ae392728b838ed7139b362c692e5d02d70ef4960a2d2acf69ee230bb0847fdd88620117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423eac068d537fc48801750063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800387b2270223a226272632d3230222c226f70223a227472616e73666572222c227469636b223a22564d5058222c22616d74223a22343830227d6821c1117f692257b2331233b5705ce9c682be8719ff1b2b64cbca290bd6faeb54423e00000000",
      types.uint(77),
      types.uint(133),
      types.uint(2),
      types.ascii("VMPX"),
      types.uint(480)
    ], deployer.address)).result);
  },
});