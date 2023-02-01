pragma solidity 0.8.17;

contract Counter {
    uint256 public counter = 0;

    function setCounter(uint256 val) external {
        counter = val;
    }

    function addAll(uint256[] calldata values) external {
        for (uint32 i = 0; i < values.length; i++) {
            counter += values[i];
        }
    }
}
