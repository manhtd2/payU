// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {StreamManager} from "../src/StreamManager.sol";

/// @notice Deploys StreamManager to Arc Testnet with USDC + EURC pre-whitelisted.
///
/// Sign with a keystore or hardware wallet — never a plaintext private key — for any
/// non-local run:
///   cast wallet import payu-deployer --interactive
///   forge script script/Deploy.s.sol --rpc-url arc_testnet \
///     --account payu-deployer --sender <deployer-address> --broadcast
///
/// (`--private-key $PRIVATE_KEY` is fine only against a local anvil instance.)
contract Deploy is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;

    function run() external returns (StreamManager manager) {
        vm.startBroadcast();

        address[] memory tokens = new address[](2);
        tokens[0] = USDC;
        tokens[1] = EURC;

        manager = new StreamManager(msg.sender, tokens);

        vm.stopBroadcast();

        console.log("StreamManager deployed at:", address(manager));
        console.log("Owner:", msg.sender);
        console.log("USDC whitelisted:", USDC);
        console.log("EURC whitelisted:", EURC);
    }
}
