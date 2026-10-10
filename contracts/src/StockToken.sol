// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin/contracts/access/Ownable.sol";

/// @title StockToken
/// @notice Testnet tokenized-equity token (simulated). Only the venue may mint and burn it.
/// @dev Mainnet replaces this with a real xStock / Monday Trade token — the vault and venue
///      interfaces stay identical.
contract StockToken is ERC20, Ownable {
    address public minter;

    event MinterUpdated(address indexed minter);

    error NotMinter();
    error ZeroAddress();

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) Ownable(msg.sender) {}

    /// @notice Point the token at its venue (one-time).
    function setMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) revert ZeroAddress();
        minter = minter_;
        emit MinterUpdated(minter_);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }
}
