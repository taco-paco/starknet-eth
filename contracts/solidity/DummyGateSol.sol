pragma solidity 0.8.17;

contract DummyGateSol {
    event Sent(bytes to, bytes data);

    bool public result = false;
    bytes32 public hashRes;

    function _calculateHash(bytes memory data) internal {
        hashRes = keccak256(data);
    }

    function claim(address to, bytes memory data) external returns (bool) {
        _calculateHash(data);

        bool res;
        assembly {
            res := call(gas(), to, 0, add(data, 0x20), mload(data), 0, 0)
        }

        result = res;
        return res;
    }

    function send(bytes memory to, bytes memory data) external {
        _calculateHash(abi.encodePacked(to, data));

        emit Sent(to, data);
    }
}
