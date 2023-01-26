%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin

@event
func Sent(data_len: felt, data: felt*) {
}

@constructor
func constructor{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() {
    return ();
}

@external
func send{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    data_len: felt, data: felt*
) {
    Sent.emit(data_len, data);
    return ();
}
