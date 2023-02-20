%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin, BitwiseBuiltin
from starkware.cairo.common.alloc import alloc
from starkware.cairo.common.math import split_felt
from starkware.cairo.common.uint256 import Uint256
from starkware.starknet.common.syscalls import call_contract
from starkware.cairo.common.cairo_keccak.keccak import (
    finalize_keccak,
    keccak_uint256s,
    keccak_bigend,
    keccak_uint256s_bigend,
    keccak_add_uint256s,
)
from starkware.cairo.common.memcpy import memcpy

@event
func Sent(data_len: felt, data: Uint256*) {
}

@event
func Claim(to: felt, data_len: felt, data: felt*) {
}

@storage_var
func s_hash() -> (res: Uint256) {
}

@constructor
func constructor{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
    return ();
}

@view
func getHash{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: Uint256) {
    let (hash) = s_hash.read();
    return (hash,);
}

@external
func send{
    syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr, bitwise_ptr: BitwiseBuiltin*
}(data_len: felt, data: Uint256*) {
    Sent.emit(data_len, data);
    _calculate_hash_send(data_len, data);

    return ();
}

@external
func claim{
    syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr, bitwise_ptr: BitwiseBuiltin*
}(to: felt, data_len: felt, data: felt*) {
    let result = call_contract(
        contract_address=to,
        function_selector=data[0],
        calldata_size=data_len - 1,
        calldata=data + 1,
    );

    _calculate_hash_claim(to, data_len, data);

    return ();
}

func _calculate_hash_claim{
    syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr, bitwise_ptr: BitwiseBuiltin*
}(to: felt, data_len: felt, data: felt*) {
    alloc_locals;

    let (arr: felt*) = alloc();
    assert arr[0] = to;

    let arr_start = arr + 1;
    memcpy(arr_start, data, data_len);

    let (arr_uint256: Uint256*) = alloc();
    let arr_uint256_start = arr_uint256;
    felts_to_uint256s(arr_uint256_start, arr, data_len + 1);

    return _calculate_hash_send(data_len + 1, arr_uint256);
}

func _calculate_hash_send{
    syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr, bitwise_ptr: BitwiseBuiltin*
}(data_len: felt, data: Uint256*) {
    alloc_locals;
    let (local keccak_ptr: felt*) = alloc();
    let keccak_ptr_start = keccak_ptr;

    let (hash) = keccak_uint256s_bigend{keccak_ptr=keccak_ptr}(data_len, data);
    finalize_keccak(keccak_ptr_start=keccak_ptr_start, keccak_ptr_end=keccak_ptr);
    s_hash.write(hash);

    return ();
}

func felt_to_uint256{range_check_ptr}(x) -> (uint_x: Uint256) {
    let (high, low) = split_felt(x);
    return (Uint256(low=low, high=high),);
}

func felts_to_uint256s{range_check_ptr}(dst: Uint256*, src: felt*, src_len: felt) {
    if (src_len == 0) {
        return ();
    }

    let (res: Uint256) = felt_to_uint256([src]);
    assert [dst] = res;

    return felts_to_uint256s(dst + 2, src + 1, src_len - 1);
}
