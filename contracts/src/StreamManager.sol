// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title StreamManager — programmable per-second USDC/EURC payment streaming for PayU (Arc)
contract StreamManager is ReentrancyGuard, Ownable, EIP712 {
    using SafeERC20 for IERC20;

    struct Stream {
        address sender; // paying business EOA (no multisig in MVP)
        address recipient; // contractor/freelancer
        address token; // must be in allowedTokens
        uint256 totalAmount;
        uint256 ratePerSecond; // informational (totalAmount / duration); balance math below avoids compounding its rounding
        uint256 startTime;
        uint256 stopTime; // originally scheduled end, fixed at creation — never mutated by cancellation
        uint256 withdrawn;
        uint256 nonce; // withdrawFor replay protection
        bool cancelled;
        uint256 cancelledAt; // accrual freeze point once cancelled; 0 while active
    }

    struct StreamParams {
        address recipient;
        address token;
        uint256 totalAmount;
        uint256 startTime;
        uint256 duration;
    }

    uint256 public constant MAX_BATCH_SIZE = 50;
    uint256 public constant MAX_GAS_FEE = 0.05e6; // relayer fee cap, 0.05 USDC (6 decimals)

    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("WithdrawAuthorization(uint256 streamId,uint256 amount,uint256 gasFee,uint256 nonce)");

    mapping(address => bool) public allowedTokens;
    mapping(uint256 => Stream) public streams;
    uint256 public nextStreamId;

    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 stopTime,
        uint256 ratePerSecond
    );
    event Withdrawn(
        uint256 indexed streamId, address indexed recipient, uint256 amount, uint256 gasFee, address relayer, bytes memo
    );
    event StreamCancelled(uint256 indexed streamId, uint256 streamedToRecipient, uint256 refundToSender);

    error TokenNotAllowed(address token);
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidStartTime();
    error BatchTooLarge(uint256 length);
    error StreamNotFound(uint256 streamId);
    error StreamAlreadyCancelled(uint256 streamId);
    error NotStreamRecipient(address caller);
    error NotStreamSender(address caller);
    error InsufficientWithdrawableBalance(uint256 requested, uint256 available);
    error GasFeeExceedsCap(uint256 gasFee);
    error GasFeeExceedsAmount(uint256 gasFee, uint256 amount);
    error InvalidSignature();

    constructor(address initialOwner, address[] memory initialTokens)
        Ownable(initialOwner)
        EIP712("PayUStreamManager", "1")
    {
        for (uint256 i = 0; i < initialTokens.length; i++) {
            allowedTokens[initialTokens[i]] = true;
            emit TokenAllowlistUpdated(initialTokens[i], true);
        }
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    function createStream(address recipient, address token, uint256 totalAmount, uint256 startTime, uint256 duration)
        external
        returns (uint256 streamId)
    {
        streamId = _createStream(msg.sender, recipient, token, totalAmount, startTime, duration);
    }

    function createBatch(StreamParams[] calldata streamParams) external returns (uint256[] memory streamIds) {
        uint256 len = streamParams.length;
        if (len > MAX_BATCH_SIZE) revert BatchTooLarge(len);

        streamIds = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            StreamParams calldata p = streamParams[i];
            streamIds[i] = _createStream(msg.sender, p.recipient, p.token, p.totalAmount, p.startTime, p.duration);
        }
    }

    function balanceOf(uint256 streamId) public view returns (uint256 withdrawable) {
        Stream storage s = _getStream(streamId);
        withdrawable = _streamedAmount(s) - s.withdrawn;
    }

    /// @notice Contractor withdraws directly, paying their own gas in the token they hold.
    function withdraw(uint256 streamId, uint256 amount, bytes calldata memo) external nonReentrant {
        Stream storage s = _getStream(streamId);
        if (msg.sender != s.recipient) revert NotStreamRecipient(msg.sender);
        _withdraw(streamId, s, amount, 0, memo);
    }

    /// @notice Gasless withdrawal: relayer submits on the recipient's EIP-712 authorization,
    /// deducting `gasFee` from the withdrawn amount instead of requiring the recipient to hold gas.
    function withdrawFor(
        uint256 streamId,
        uint256 amount,
        uint256 gasFee,
        bytes calldata memo,
        bytes calldata signature
    ) external nonReentrant {
        Stream storage s = _getStream(streamId);
        if (gasFee > MAX_GAS_FEE) revert GasFeeExceedsCap(gasFee);
        if (gasFee > amount) revert GasFeeExceedsAmount(gasFee, amount);

        uint256 currentNonce = s.nonce;
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, streamId, amount, gasFee, currentNonce));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (signer != s.recipient) revert InvalidSignature();

        s.nonce = currentNonce + 1;
        _withdraw(streamId, s, amount, gasFee, memo);
    }

    /// @notice Sender ends the stream early. The portion already streamed remains withdrawable
    /// by the recipient; the un-streamed remainder is refunded to the sender immediately.
    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage s = _getStream(streamId);
        if (msg.sender != s.sender) revert NotStreamSender(msg.sender);
        if (s.cancelled) revert StreamAlreadyCancelled(streamId);

        s.cancelled = true;
        s.cancelledAt = block.timestamp;

        uint256 streamed = _streamedAmount(s);
        uint256 refund = s.totalAmount - streamed;

        emit StreamCancelled(streamId, streamed, refund);

        if (refund > 0) {
            IERC20(s.token).safeTransfer(s.sender, refund);
        }
    }

    function _createStream(
        address sender,
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 duration
    ) internal returns (uint256 streamId) {
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (recipient == address(0) || recipient == sender) revert InvalidRecipient();
        if (totalAmount == 0) revert InvalidAmount();
        if (duration == 0) revert InvalidDuration();
        if (startTime < block.timestamp) revert InvalidStartTime();

        streamId = nextStreamId++;
        uint256 stopTime = startTime + duration;

        streams[streamId] = Stream({
            sender: sender,
            recipient: recipient,
            token: token,
            totalAmount: totalAmount,
            ratePerSecond: totalAmount / duration,
            startTime: startTime,
            stopTime: stopTime,
            withdrawn: 0,
            nonce: 0,
            cancelled: false,
            cancelledAt: 0
        });

        IERC20(token).safeTransferFrom(sender, address(this), totalAmount);

        emit StreamCreated(streamId, sender, recipient, token, totalAmount, startTime, stopTime, totalAmount / duration);
    }

    function _withdraw(uint256 streamId, Stream storage s, uint256 amount, uint256 gasFee, bytes calldata memo)
        internal
    {
        if (amount == 0) revert InvalidAmount();

        uint256 withdrawable = _streamedAmount(s) - s.withdrawn;
        if (amount > withdrawable) revert InsufficientWithdrawableBalance(amount, withdrawable);

        s.withdrawn += amount; // effects before interactions

        address recipient = s.recipient;
        address token = s.token;

        emit Withdrawn(streamId, recipient, amount, gasFee, msg.sender, memo);

        if (gasFee > 0) {
            IERC20(token).safeTransfer(msg.sender, gasFee);
        }
        IERC20(token).safeTransfer(recipient, amount - gasFee);
    }

    /// @dev Multiplies before dividing (totalAmount * elapsed / duration) so no dust is lost to
    /// floor-division the way a pre-divided ratePerSecond would; snaps to totalAmount once the
    /// (possibly cancellation-shortened via cancelledAt) window has fully elapsed.
    function _streamedAmount(Stream storage s) internal view returns (uint256) {
        uint256 effectiveNow = s.cancelled ? s.cancelledAt : block.timestamp;
        if (effectiveNow <= s.startTime) return 0;
        if (effectiveNow >= s.stopTime) return s.totalAmount;

        uint256 duration = s.stopTime - s.startTime;
        uint256 elapsed = effectiveNow - s.startTime;
        return (s.totalAmount * elapsed) / duration;
    }

    function _getStream(uint256 streamId) internal view returns (Stream storage s) {
        s = streams[streamId];
        if (s.sender == address(0)) revert StreamNotFound(streamId);
    }
}
