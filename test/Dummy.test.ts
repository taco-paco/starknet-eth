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
import { Uint256, uint256ToBN, bnToUint256 } from "starknet/dist/utils/uint256";
import { removeHexPrefix } from "starknet/dist/utils/encode";

let web3 = new Web3("ws://localhost:8546");

async function mint(address: string, amount: number, lite = true) {
  await axios.post(`${starknet.networkConfig.url}/mint`, {
    amount,
    address,
    lite,
  });
}

const BYTE_LEN: number = 8;
const CHUNK_SIZE: number = 32; // 31;
const MAX_CHUNK_HEX = "0x" + "F".repeat(CHUNK_SIZE * 2);
const MAX_CHUNK = BigNumber.from(MAX_CHUNK_HEX);

function getBytesLen(number: BigNumber): number {
  let hex = number.toHexString();
  return Math.ceil(hex.replace(/^0x/, "").length / 2);
}

function starknetEncode(number: BigNumber): Uint256[] {
  const bytesLen = getBytesLen(number);
  const shift = Math.ceil(bytesLen / CHUNK_SIZE) * CHUNK_SIZE - bytesLen;
  number = number.shl(shift * BYTE_LEN);

  let output: BigNumber[] = [];
  while (number.gt(BigNumber.from(0))) {
    let felt = number.and(MAX_CHUNK);
    output = [felt, ...output];

    number = number.shr(CHUNK_SIZE * BYTE_LEN);
  }

  return output.map((el) => bnToUint256(el.toHexString()));
}

function starknetDecode(uint256s: Uint256[]): string {
  let number = BigNumber.from(0);
  for (let num of uint256s) {
    number = number.shl(CHUNK_SIZE * BYTE_LEN);
    number = number.or("0x" + uint256ToBN(num).toString(16));
  }

  return number.toHexString();
}

function parseEvent(event: any) {
  const SIZEOF_UINT256 = 2;

  const dataLen = parseInt(event.data[0], 16) * SIZEOF_UINT256;
  const feltsString = event.data.slice(1, event.data.length);

  let uint256s: Uint256[] = [];
  for (let i = 0; i < dataLen; i += 2) {
    const low = feltsString[i];
    const high = feltsString[i + 1];

    uint256s.push({ low, high });
  }

  return starknetDecode(uint256s);
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

function encodeAddAll(values: string[]) {
  let signature = web3.eth.abi.encodeFunctionSignature({
    name: "addAll",
    type: "function",
    inputs: [
      {
        type: "uint256[]",
        name: "values",
      },
    ],
  });

  let params = web3.eth.abi.encodeParameters(["uint256[]"], [values]);

  return signature + removeHexPrefix(params);
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

  it.skip("Eth only transaction", async function () {
    const val = "102";
    const calldata = encodeSetCounter(val);
    console.log(calldata);
    let tx = await dummyClaim.claim(counter.address, calldata);
    await tx.wait();

    const res = await counter.counter();
    expect(res).to.eql(BigNumber.from(val));
  });

  it.skip("Eth only transaction", async function () {
    const values = ["1", "2", "3", "4", "5"];
    const calldata = encodeAddAll(values);
    let tx = await dummyClaim.claim(counter.address, calldata);
    await tx.wait();

    const res = await counter.counter();
    expect(res).to.eql(BigNumber.from(15));
  });

  it.skip("Starknet-eth transaction", async function () {
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
    expect(res).to.eql(BigNumber.from(val));

    const hashStrk = await dummySend.call("getHash");
    const uint: Uint256 = {
      low: hashStrk.res.low,
      high: hashStrk.res.high,
    };
    const hashStrkStr = "0x" + uint256ToBN(uint).toString(16);

    const hashEth = await dummyClaim.hashRes();
    expect(hashStrkStr).to.equal(hashEth);
  });

  it("Starknet-eth array transaction", async function () {
    const val = ["1", "2", "3", "4", "5"];
    const calldata = encodeAddAll(val);
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
    expect(res).to.eql(BigNumber.from(15));

    const hashStrk = await dummySend.call("getHash");
    const uint: Uint256 = {
      low: hashStrk.res.low,
      high: hashStrk.res.high,
    };
    const hashStrkStr = "0x" + uint256ToBN(uint).toString(16);

    const hashEth = await dummyClaim.hashRes();
    expect(hashStrkStr).to.equal(hashEth);
  });
});
