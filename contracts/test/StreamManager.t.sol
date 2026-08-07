// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {StreamManager} from "../src/StreamManager.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract StreamManagerTest is Test {
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("WithdrawAuthorization(uint256 streamId,uint256 amount,uint256 gasFee,uint256 nonce)");
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    StreamManager internal manager;
    MockERC20 internal usdc;

    address internal owner = makeAddr("owner");
    address internal sender = makeAddr("sender");
    uint256 internal recipientPk = 0xA11CE;
    address internal recipient;
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant TOTAL_AMOUNT = 1000e6; // 1000 USDC
    uint256 internal constant DURATION = 1000; // 1000 seconds -> 1 USDC/sec, divides evenly

    function setUp() public {
        recipient = vm.addr(recipientPk);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        manager = new StreamManager(owner, tokens);

        usdc.mint(sender, 1_000_000e6);
        vm.prank(sender);
        usdc.approve(address(manager), type(uint256).max);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("PayUStreamManager")),
                keccak256(bytes("1")),
                block.chainid,
                address(manager)
            )
        );
    }

    function _signWithdraw(uint256 streamId, uint256 amount, uint256 gasFee, uint256 nonce, uint256 pk)
        internal
        view
        returns (bytes memory signature)
    {
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, streamId, amount, gasFee, nonce));
        bytes32 digest = MessageHashUtils.toTypedDataHash(_domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function _createDefaultStream() internal returns (uint256 streamId) {
        vm.prank(sender);
        streamId = manager.createStream(recipient, address(usdc), TOTAL_AMOUNT, block.timestamp, DURATION);
    }

    // ---------- createStream ----------

    function test_createStream_locksFundsAndEmits() public {
        uint256 senderBalanceBefore = usdc.balanceOf(sender);

        vm.expectEmit(true, true, true, true);
        emit StreamManager.StreamCreated(
            0, sender, recipient, address(usdc), TOTAL_AMOUNT, block.timestamp, block.timestamp + DURATION, 1e6
        );

        uint256 streamId = _createDefaultStream();

        assertEq(streamId, 0);
        assertEq(usdc.balanceOf(address(manager)), TOTAL_AMOUNT);
        assertEq(usdc.balanceOf(sender), senderBalanceBefore - TOTAL_AMOUNT);
    }

    function test_createStream_revertsOnDisallowedToken() public {
        MockERC20 randomToken = new MockERC20("Random", "RND", 18);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.TokenNotAllowed.selector, address(randomToken)));
        manager.createStream(recipient, address(randomToken), TOTAL_AMOUNT, block.timestamp, DURATION);
    }

    function test_createStream_revertsOnZeroDuration() public {
        vm.prank(sender);
        vm.expectRevert(StreamManager.InvalidDuration.selector);
        manager.createStream(recipient, address(usdc), TOTAL_AMOUNT, block.timestamp, 0);
    }

    function test_createStream_revertsOnZeroAmount() public {
        vm.prank(sender);
        vm.expectRevert(StreamManager.InvalidAmount.selector);
        manager.createStream(recipient, address(usdc), 0, block.timestamp, DURATION);
    }

    function test_createStream_revertsOnPastStartTime() public {
        vm.warp(1000);
        vm.prank(sender);
        vm.expectRevert(StreamManager.InvalidStartTime.selector);
        manager.createStream(recipient, address(usdc), TOTAL_AMOUNT, block.timestamp - 1, DURATION);
    }

    function test_createStream_revertsOnSelfRecipient() public {
        vm.prank(sender);
        vm.expectRevert(StreamManager.InvalidRecipient.selector);
        manager.createStream(sender, address(usdc), TOTAL_AMOUNT, block.timestamp, DURATION);
    }

    // ---------- createBatch ----------

    function test_createBatch_createsMultipleStreams() public {
        StreamManager.StreamParams[] memory params = new StreamManager.StreamParams[](3);
        for (uint256 i = 0; i < 3; i++) {
            params[i] = StreamManager.StreamParams({
                recipient: makeAddr(string.concat("recipient", vm.toString(i))),
                token: address(usdc),
                totalAmount: TOTAL_AMOUNT,
                startTime: block.timestamp,
                duration: DURATION
            });
        }

        vm.prank(sender);
        uint256[] memory ids = manager.createBatch(params);

        assertEq(ids.length, 3);
        assertEq(usdc.balanceOf(address(manager)), TOTAL_AMOUNT * 3);
    }

    function test_createBatch_revertsWhenExceedingMaxBatchSize() public {
        uint256 tooMany = manager.MAX_BATCH_SIZE() + 1;
        StreamManager.StreamParams[] memory params = new StreamManager.StreamParams[](tooMany);
        for (uint256 i = 0; i < tooMany; i++) {
            params[i] = StreamManager.StreamParams({
                recipient: recipient,
                token: address(usdc),
                totalAmount: 1e6,
                startTime: block.timestamp,
                duration: DURATION
            });
        }

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.BatchTooLarge.selector, tooMany));
        manager.createBatch(params);
    }

    // ---------- streaming math / balanceOf ----------

    function test_balanceOf_zeroBeforeStart() public {
        uint256 streamId = _createDefaultStream();
        assertEq(manager.balanceOf(streamId), 0);
    }

    function test_balanceOf_partialAccrual() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);
        assertEq(manager.balanceOf(streamId), 400e6);
    }

    function test_balanceOf_fullAfterStopTime_noDustStuck() public {
        // 1000e6 / 999 seconds does not divide evenly -> checks the multiply-before-divide path
        vm.prank(sender);
        uint256 streamId = manager.createStream(recipient, address(usdc), 1000e6, block.timestamp, 999);

        vm.warp(block.timestamp + 10_000); // long past stopTime
        assertEq(manager.balanceOf(streamId), 1000e6, "must equal full totalAmount, no dust left unclaimable");
    }

    // ---------- withdraw ----------

    function test_withdraw_transfersToRecipient() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        vm.prank(recipient);
        manager.withdraw(streamId, 300e6, "");

        assertEq(usdc.balanceOf(recipient), 300e6);
        assertEq(manager.balanceOf(streamId), 100e6);
    }

    function test_withdraw_revertsForNonRecipient() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.NotStreamRecipient.selector, stranger));
        manager.withdraw(streamId, 100e6, "");
    }

    function test_withdraw_revertsWhenExceedingWithdrawable() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.InsufficientWithdrawableBalance.selector, 401e6, 400e6));
        manager.withdraw(streamId, 401e6, "");
    }

    // ---------- withdrawFor (gasless) ----------

    function test_withdrawFor_paysRelayerAndRecipient() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        uint256 gasFee = 0.01e6;
        bytes memory sig = _signWithdraw(streamId, 300e6, gasFee, 0, recipientPk);

        vm.prank(relayer);
        manager.withdrawFor(streamId, 300e6, gasFee, "", sig);

        assertEq(usdc.balanceOf(relayer), gasFee);
        assertEq(usdc.balanceOf(recipient), 300e6 - gasFee);
    }

    function test_withdrawFor_incrementsNonceAndRejectsReplay() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        bytes memory sig = _signWithdraw(streamId, 100e6, 0, 0, recipientPk);

        vm.prank(relayer);
        manager.withdrawFor(streamId, 100e6, 0, "", sig);

        (,,,,,,,, uint256 nonceAfter,,) = manager.streams(streamId);
        assertEq(nonceAfter, 1);

        // replay with the same (now-stale) nonce=0 signature must fail signer recovery
        vm.prank(relayer);
        vm.expectRevert(StreamManager.InvalidSignature.selector);
        manager.withdrawFor(streamId, 100e6, 0, "", sig);
    }

    function test_withdrawFor_revertsOnWrongSigner() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        uint256 imposterPk = 0xBAD;
        bytes memory sig = _signWithdraw(streamId, 100e6, 0, 0, imposterPk);

        vm.prank(relayer);
        vm.expectRevert(StreamManager.InvalidSignature.selector);
        manager.withdrawFor(streamId, 100e6, 0, "", sig);
    }

    function test_withdrawFor_revertsWhenGasFeeExceedsCap() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        uint256 tooHighFee = manager.MAX_GAS_FEE() + 1;
        bytes memory sig = _signWithdraw(streamId, 300e6, tooHighFee, 0, recipientPk);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.GasFeeExceedsCap.selector, tooHighFee));
        manager.withdrawFor(streamId, 300e6, tooHighFee, "", sig);
    }

    function test_withdrawFor_revertsWhenGasFeeExceedsAmount() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        uint256 gasFee = 0.02e6;
        bytes memory sig = _signWithdraw(streamId, 0.01e6, gasFee, 0, recipientPk);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.GasFeeExceedsAmount.selector, gasFee, 0.01e6));
        manager.withdrawFor(streamId, 0.01e6, gasFee, "", sig);
    }

    // ---------- cancelStream ----------

    function test_cancelStream_freezesStreamedAndRefundsRemainder() public {
        uint256 streamId = _createDefaultStream();
        vm.warp(block.timestamp + 400);

        uint256 senderBalanceBefore = usdc.balanceOf(sender);

        vm.prank(sender);
        manager.cancelStream(streamId);

        assertEq(usdc.balanceOf(sender), senderBalanceBefore + 600e6, "unstreamed 600 USDC refunded immediately");
        assertEq(manager.balanceOf(streamId), 400e6, "streamed 400 USDC remains withdrawable");

        // time passing after cancellation must not accrue further
        vm.warp(block.timestamp + 1000);
        assertEq(manager.balanceOf(streamId), 400e6);

        // recipient can still withdraw what had already streamed
        vm.prank(recipient);
        manager.withdraw(streamId, 400e6, "");
        assertEq(usdc.balanceOf(recipient), 400e6);
    }

    function test_cancelStream_revertsForNonSender() public {
        uint256 streamId = _createDefaultStream();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.NotStreamSender.selector, stranger));
        manager.cancelStream(streamId);
    }

    function test_cancelStream_revertsWhenAlreadyCancelled() public {
        uint256 streamId = _createDefaultStream();

        vm.prank(sender);
        manager.cancelStream(streamId);

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.StreamAlreadyCancelled.selector, streamId));
        manager.cancelStream(streamId);
    }

    // ---------- token whitelist ----------

    function test_owner_canUpdateTokenAllowlist() public {
        MockERC20 eurc = new MockERC20("EURC", "EURC", 6);
        eurc.mint(sender, 1_000_000e6);

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(StreamManager.TokenNotAllowed.selector, address(eurc)));
        manager.createStream(recipient, address(eurc), TOTAL_AMOUNT, block.timestamp, DURATION);

        vm.prank(owner);
        manager.setTokenAllowed(address(eurc), true);

        vm.prank(sender);
        eurc.approve(address(manager), type(uint256).max);
        vm.prank(sender);
        manager.createStream(recipient, address(eurc), TOTAL_AMOUNT, block.timestamp, DURATION);
    }

    function test_nonOwner_cannotUpdateTokenAllowlist() public {
        vm.prank(stranger);
        vm.expectRevert();
        manager.setTokenAllowed(address(usdc), false);
    }
}
