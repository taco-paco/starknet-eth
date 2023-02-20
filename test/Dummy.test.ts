import axios from "axios";
import { ethers, starknet, network } from "hardhat";
import { BigNumber, Contract, ContractFactory } from "ethers";
import {
  CairoFunction,
  Argument,
} from "@shardlabs/starknet-hardhat-plugin/dist/src/starknet-types";
import { adaptOutputUtil } from "@shardlabs/starknet-hardhat-plugin/dist/src/adapt";
import {
  Account,
  StarknetContractFactory,
  StarknetContract,
  HttpNetworkConfig,
} from "hardhat/types";
import Web3 from "web3";
import { expect } from "chai";
import { stark, uint256, hash } from "starknet";
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

function padFeltToUin256(value: string) {
  // TODO: add range check for felt
  let hex = BigNumber.from(value).toBigInt().toString(16);
  let output = "0".repeat(CHUNK_SIZE * 2 - hex.length) + hex;
  return output;
}

function encodeCalldata(args: string[]) {
  let calldata = "";
  for (let arg of args) {
    calldata += padFeltToUin256(arg);
  }

  return "0x" + calldata;
}

// function asd(
//   contract: StarknetContract,
//   inputs: string[],
//   functionName: string
// ) {
//   const abi = contract.getAbi();
//   const func = <CairoFunction>abi[functionName];
//   let asd = adaptOutputUtil(inputs.join(" "), func.inputs, abi);
// }

// From solidity to starknet
function parseToFelts(calldata: string) {
  calldata = calldata.slice(2, calldata.length);
  let output: bigint[] = [];
  for (let i = 0; i < calldata.length; i += CHUNK_SIZE * 2) {
    const s = calldata.slice(i, i + CHUNK_SIZE * 2);
    output.push(BigNumber.from("0x" + s).toBigInt());
  }

  return output;
}

describe("Dummy test", function () {
  let account: Account;
  let dummyGateCairo: StarknetContract;
  let counterCairo: StarknetContract;

  let dummyGateSol: Contract;
  let counterSol: Contract;

  before(async function () {
    // cairo
    {
      account = await starknet.OpenZeppelinAccount.createAccount();
      await mint(account.address, 1e18);
      await account.deployAccount({ maxFee: 1e18 });

      const dummyGateCairoFactory = await starknet.getContractFactory(
        "DummyGateCairo"
      );
      await account.declare(dummyGateCairoFactory, { maxFee: 1e18 });
      dummyGateCairo = await account.deploy(dummyGateCairoFactory);

      const counterCairoFactory = await starknet.getContractFactory("Counter");
      await account.declare(counterCairoFactory, { maxFee: 1e18 });
      counterCairo = await account.deploy(counterCairoFactory);
    }

    // solidity
    {
      const dummyGateSolFactory = await ethers.getContractFactory(
        "DummyGateSol"
      );
      dummyGateSol = await dummyGateSolFactory.deploy();
      await dummyGateSol.deployed();

      const counterSolFactory = await ethers.getContractFactory("Counter");
      counterSol = await counterSolFactory.deploy();
      await counterSol.deployed();
    }
  });

  it.only("Senf to Starknet", async function () {
    let to = counterCairo.address;
    const selector = hash.getSelectorFromName("setCounter");

    to = "0x" + padFeltToUin256(to);
    const calldata = encodeCalldata([selector, "2"]);

    let tx = await dummyGateSol.send(to, calldata);
    let receipt = await tx.wait();
    let event = receipt.events?.filter((x: any) => {
      return x.event == "Sent";
    })[0];

    let toEv = event.args[0];
    let calldataEv = event.args[1];

    toEv = parseToFelts(toEv)[0];
    calldataEv = parseToFelts(calldataEv);

    await account.invoke(dummyGateCairo, "claim", {
      to: toEv,
      data: calldataEv,
    });
    const hashStrk = await dummyGateCairo.call("getHash");
    const uint: Uint256 = {
      low: hashStrk.res.low,
      high: hashStrk.res.high,
    };
    const hashStrkStr = "0x" + uint256ToBN(uint).toString(16);

    expect(hashStrkStr).to.equal(await dummyGateSol.hashRes());
  });

  it.skip("Eth only transaction", async function () {
    const val = "102";
    const calldata = encodeSetCounter(val) + "000000000000".repeat(5);
    console.log(calldata);
    let tx = await dummyGateSol.claim(counterSol.address, calldata);
    await tx.wait();

    const res = await counterSol.counter();
    expect(res).to.eql(BigNumber.from(val));
  });

  it.skip("Eth only transaction", async function () {
    const values = ["1", "2", "3", "4", "5"];
    const calldata = encodeAddAll(values);
    let tx = await dummyGateSol.claim(counterSol.address, calldata);
    await tx.wait();

    const res = await counterSol.counter();
    expect(res).to.eql(BigNumber.from(15));
  });

  it.skip("Starknet-eth transaction", async function () {
    const val = "22";
    const calldata = encodeSetCounter(val);
    const starknetCalldata = starknetEncode(BigNumber.from(calldata));

    let tx = await account.invoke(dummyGateCairo, "send", {
      data: starknetCalldata,
    });
    const receipt = await starknet.getTransactionReceipt(tx);
    let block = await starknet.getBlock({
      blockNumber: receipt.block_number,
    });
    let events = block.transaction_receipts[0].events;
    let event = events[0];

    const decodedStarknetCalldata = parseEvent(event);
    let ethTx = await dummyGateSol.claim(
      counterSol.address,
      decodedStarknetCalldata
    );
    await ethTx.wait();

    const res = await counterSol.counter();
    expect(res).to.eql(BigNumber.from(val));

    const hashStrk = await dummyGateCairo.call("getHash");
    const uint: Uint256 = {
      low: hashStrk.res.low,
      high: hashStrk.res.high,
    };
    const hashStrkStr = "0x" + uint256ToBN(uint).toString(16);

    const hashEth = await dummyGateSol.hashRes();
    expect(hashStrkStr).to.equal(hashEth);
  });

  it.skip("Starknet-eth array transaction", async function () {
    const val = ["1", "2", "3", "4", "5"];
    const calldata = encodeAddAll(val);
    const starknetCalldata = starknetEncode(BigNumber.from(calldata));

    let tx = await account.invoke(dummyGateCairo, "send", {
      data: starknetCalldata,
    });
    const receipt = await starknet.getTransactionReceipt(tx);
    let block = await starknet.getBlock({
      blockNumber: receipt.block_number,
    });
    let events = block.transaction_receipts[0].events;
    let event = events[0];

    const decodedStarknetCalldata = parseEvent(event);
    let ethTx = await dummyGateSol.claim(
      counterSol.address,
      decodedStarknetCalldata
    );
    await ethTx.wait();

    const res = await counterSol.counter();
    expect(res).to.eql(BigNumber.from(15));

    const hashStrk = await dummyGateCairo.call("getHash");
    const uint: Uint256 = {
      low: hashStrk.res.low,
      high: hashStrk.res.high,
    };
    const hashStrkStr = "0x" + uint256ToBN(uint).toString(16);

    const hashEth = await dummyGateSol.hashRes();
    expect(hashStrkStr).to.equal(hashEth);
  });
});
