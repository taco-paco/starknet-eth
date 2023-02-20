%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin

@storage_var
func s_counter() -> (res: felt) {
}

@external
func setCounter{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(counter: felt) {
    s_counter.write(counter);
    return ();
}

@view
func getCounter{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}() -> (res: felt) {
    let (counter) = s_counter.read();
    return (counter,);
}
