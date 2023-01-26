pragma solidity 0.8.17;

contract DummyClaim {
    bool public result = false;

    function claim(address to, bytes memory data) external returns (bool) {
        bool res;
        assembly {
            res := call(gas(), to, 0, add(data, 0x20), mload(data), 0, 0)
        }

        result = res;
        return res;
    }
}
