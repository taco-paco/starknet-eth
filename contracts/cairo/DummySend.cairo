%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin, BitwiseBuiltin
from starkware.cairo.common.alloc import alloc
from starkware.cairo.common.uint256 import Uint256
from starkware.cairo.common.cairo_keccak.keccak import (
    finalize_keccak,
    keccak_uint256s,
    keccak_felts_bigend,
    keccak_bigend,
    keccak_uint256s_bigend,
    keccak_add_uint256s,
)

@event
func Sent(data_len: felt, data: Uint256*) {
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
    _calculate_hash(data_len, data);

    return ();
}

func _calculate_hash{
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
