import axios from "axios";
import { ethers, starknet, network } from "hardhat";
import { BigNumber, Contract, ContractFactory } from "ethers";
import {
  Account,
  StarknetContractFactory,
  StarknetContract,
  HttpNetworkConfig,
} from "hardhat/types";
import Web3 from "web3";
import { expect } from "chai";
import { uint256 } from "starknet";
import { Uint256, uint256ToBN } from "starknet/dist/utils/uint256";

let web3 = new Web3("ws://localhost:8546");

async function mint(address: string, amount: number, lite = true) {
  await axios.post(`${starknet.networkConfig.url}/mint`, {
    amount,
    address,
    lite,
  });
}

const BYTE_LEN: number = 8;
const FELT_BYTES_LEN: number = 32; // 31;
const maxFeltHex = "0x" + "F".repeat(FELT_BYTES_LEN * 2);
const maxFelt = BigNumber.from(maxFeltHex);

function getBytesLen(number: BigNumber): number {
  let hex = number.toHexString();
  return Math.ceil(hex.replace(/^0x/, "").length / 2);
}

function starknetEncode(number: BigNumber) {
  let bytesLen = getBytesLen(number);
  let shift = Math.ceil(bytesLen / FELT_BYTES_LEN) * FELT_BYTES_LEN - bytesLen;
  number = number.shl(shift * BYTE_LEN);
  console.log(number.toHexString());

  let output: BigNumber[] = [];
  while (number.gt(BigNumber.from(0))) {
    let felt = number.and(maxFelt);
    output = [felt, ...output];

    number = number.shr(FELT_BYTES_LEN * BYTE_LEN);
  }

  return output.map((el) => el.toBigInt());
}

function starknetDecode(felts: BigNumber[]): string {
  let number = BigNumber.from(0);
  for (let felt of felts) {
    number = number.shl(FELT_BYTES_LEN * BYTE_LEN);
    number = number.or(felt);
  }

  return number.toHexString();
}

function parseEvent(event: any) {
  let dataLen = parseInt(event.data[0]);
  let feltsString = event.data.slice(1, event.data.length);
  let felts: BigNumber[] = [];
  for (let i = 0; i < dataLen; i++) {
    const felt = BigNumber.from(feltsString[i]);
    felts.push(felt);
  }

  return starknetDecode(felts);
}

function encodeSetCounter(val: string) {
  return web3.eth.abi.encodeFunctionCall(
    {
      name: "setCounter",
      type: "function",
      inputs: [
        {
          type: "uint256",
          name: "val",
        },
      ],
    },
    [val]
  );
}

describe("Dummy test", function () {
  let account: Account;
  let dummySend: StarknetContract;

  let dummyClaim: Contract;
  let counter: Contract;

  before(async function () {
    // cairo
    {
      account = await starknet.OpenZeppelinAccount.createAccount();
      await mint(account.address, 1e18);
      await account.deployAccount({ maxFee: 1e18 });

      const dummySendFactory = await starknet.getContractFactory("DummySend");
      await account.declare(dummySendFactory, { maxFee: 1e18 });
      dummySend = await account.deploy(dummySendFactory);
    }

    // solidity
    {
      const dummyClaimFactory = await ethers.getContractFactory("DummyClaim");
      dummyClaim = await dummyClaimFactory.deploy();
      await dummyClaim.deployed();

      const counterFactory = await ethers.getContractFactory("Counter");
      counter = await counterFactory.deploy();
      await counter.deployed();
    }
  });

  it("Eth only transaction", async function () {
    const val = "102";
    const calldata = encodeSetCounter(val);
    let tx = await dummyClaim.claim(counter.address, calldata);
    await tx.wait();

    const res = await counter.counter();
    expect(res).to.eql(BigNumber.from(val));
  });

  it("Starknet-eth transaction", async function () {
    const val = "22";
    const calldata = encodeSetCounter(val);
    const starknetCalldata = starknetEncode(BigNumber.from(calldata));

    let tx = await account.invoke(dummySend, "send", {
      data: starknetCalldata,
    });
    const receipt = await starknet.getTransactionReceipt(tx);
    let block = await starknet.getBlock({
      blockNumber: receipt.block_number,
    });
    let events = block.transaction_receipts[0].events;
    let event = events[0];

    const decodedStarknetCalldata = parseEvent(event);
    let ethTx = await dummyClaim.claim(
      counter.address,
      decodedStarknetCalldata
    );
    await ethTx.wait();

    const res = await counter.counter();
    console.log(res);
    console.log(await dummyClaim.result());
    // expect(res).to.eql(BigNumber.from(val));
  });

  it("Compare hashes", async function () {
    const hashStrk = await dummySend.call("getHash");
    const uint: Uint256 = {
      low: hashStrk.res.low,
      high: hashStrk.res.high,
    };
    console.log(uint256ToBN(uint));

    const hashEth = await dummyClaim.hashRes();
    console.log(hashEth);
  });
});
