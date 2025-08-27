// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MultiSigWallet
 * @dev 多签钱包合约 - 控制HCF项目关键操作
 * 
 * 功能：
 * - 控制900万底池资金
 * - 控制税率调整
 * - 控制关键参数修改
 * - 3/5签名机制（5个签名者，需要3个确认）
 */
contract MultiSigWallet is ReentrancyGuard {
    
    // ============ 状态变量 ============
    
    // 签名者
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public requiredConfirmations;
    
    // 交易结构
    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
        mapping(address => bool) confirmed;
    }
    
    // 交易存储
    mapping(uint256 => Transaction) public transactions;
    uint256 public transactionCount;
    
    // 控制的合约地址
    address public hcfToken;
    address public hcfStaking;
    address public hcfExchange;
    
    // ============ 事件 ============
    
    event TransactionSubmitted(uint256 indexed txId, address indexed submitter, address to, uint256 value, bytes data);
    event TransactionConfirmed(uint256 indexed txId, address indexed signer);
    event TransactionRevoked(uint256 indexed txId, address indexed signer);
    event TransactionExecuted(uint256 indexed txId, address indexed executor);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event RequiredConfirmationsChanged(uint256 oldValue, uint256 newValue);
    
    // ============ 修饰器 ============
    
    modifier onlySigner() {
        require(isSigner[msg.sender], "Not a signer");
        _;
    }
    
    modifier txExists(uint256 _txId) {
        require(_txId < transactionCount, "Transaction does not exist");
        _;
    }
    
    modifier notExecuted(uint256 _txId) {
        require(!transactions[_txId].executed, "Transaction already executed");
        _;
    }
    
    modifier notConfirmed(uint256 _txId) {
        require(!transactions[_txId].confirmed[msg.sender], "Transaction already confirmed");
        _;
    }
    
    // ============ 构造函数 ============
    
    constructor(address[] memory _signers, uint256 _requiredConfirmations) {
        require(_signers.length >= 3, "At least 3 signers required");
        require(_requiredConfirmations > 0 && _requiredConfirmations <= _signers.length, "Invalid required confirmations");
        
        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "Invalid signer");
            require(!isSigner[signer], "Duplicate signer");
            
            isSigner[signer] = true;
            signers.push(signer);
        }
        
        requiredConfirmations = _requiredConfirmations;
    }
    
    // ============ 核心多签功能 ============
    
    /**
     * @dev 提交交易提案
     */
    function submitTransaction(address _to, uint256 _value, bytes memory _data) 
        external 
        onlySigner 
        returns (uint256 txId) 
    {
        txId = transactionCount;
        
        Transaction storage newTx = transactions[txId];
        newTx.to = _to;
        newTx.value = _value;
        newTx.data = _data;
        newTx.executed = false;
        newTx.confirmations = 0;
        
        transactionCount++;
        
        emit TransactionSubmitted(txId, msg.sender, _to, _value, _data);
        
        // 提交者自动确认
        confirmTransaction(txId);
        
        return txId;
    }
    
    /**
     * @dev 确认交易
     */
    function confirmTransaction(uint256 _txId) 
        public 
        onlySigner 
        txExists(_txId) 
        notExecuted(_txId) 
        notConfirmed(_txId) 
    {
        Transaction storage transaction = transactions[_txId];
        transaction.confirmed[msg.sender] = true;
        transaction.confirmations++;
        
        emit TransactionConfirmed(_txId, msg.sender);
        
        // 如果达到所需确认数，自动执行
        if (transaction.confirmations >= requiredConfirmations) {
            executeTransaction(_txId);
        }
    }
    
    /**
     * @dev 撤销确认
     */
    function revokeConfirmation(uint256 _txId) 
        external 
        onlySigner 
        txExists(_txId) 
        notExecuted(_txId) 
    {
        Transaction storage transaction = transactions[_txId];
        require(transaction.confirmed[msg.sender], "Transaction not confirmed");
        
        transaction.confirmed[msg.sender] = false;
        transaction.confirmations--;
        
        emit TransactionRevoked(_txId, msg.sender);
    }
    
    /**
     * @dev 执行交易
     */
    function executeTransaction(uint256 _txId) 
        public 
        onlySigner 
        txExists(_txId) 
        notExecuted(_txId) 
    {
        Transaction storage transaction = transactions[_txId];
        require(transaction.confirmations >= requiredConfirmations, "Not enough confirmations");
        
        transaction.executed = true;
        
        // 执行交易
        (bool success, ) = transaction.to.call{value: transaction.value}(transaction.data);
        require(success, "Transaction execution failed");
        
        emit TransactionExecuted(_txId, msg.sender);
    }
    
    // ============ HCF特定功能 ============
    
    /**
     * @dev 设置控制的合约地址
     */
    function setControlledContracts(
        address _hcfToken,
        address _hcfStaking,
        address _hcfExchange
    ) external onlySigner {
        require(hcfToken == address(0), "Contracts already set");
        hcfToken = _hcfToken;
        hcfStaking = _hcfStaking;
        hcfExchange = _hcfExchange;
    }
    
    /**
     * @dev 调整HCF税率（需要多签）
     */
    function adjustHCFTaxRates(uint256 _buyTax, uint256 _sellTax, uint256 _transferTax) 
        external 
        onlySigner 
        returns (uint256 txId) 
    {
        require(hcfToken != address(0), "HCF token not set");
        
        bytes memory data = abi.encodeWithSignature(
            "setTaxRates(uint256,uint256,uint256)",
            _buyTax,
            _sellTax,
            _transferTax
        );
        
        return this.submitTransaction(hcfToken, 0, data);
    }
    
    /**
     * @dev 从底池调用资金（需要多签）
     */
    function withdrawFromReserve(address _token, uint256 _amount, address _to) 
        external 
        onlySigner 
        returns (uint256 txId) 
    {
        bytes memory data;
        
        if (_token == address(0)) {
            // 提取ETH/BNB
            return this.submitTransaction(_to, _amount, "");
        } else {
            // 提取ERC20
            data = abi.encodeWithSignature(
                "transfer(address,uint256)",
                _to,
                _amount
            );
            return this.submitTransaction(_token, 0, data);
        }
    }
    
    /**
     * @dev 添加流动性到底池（需要多签）
     */
    function addLiquidityToPool(
        address _exchange,
        uint256 _hcfAmount,
        uint256 _bsdtAmount
    ) external onlySigner returns (uint256 txId) {
        require(hcfExchange != address(0), "Exchange not set");
        
        bytes memory data = abi.encodeWithSignature(
            "addLiquidity(uint256,uint256)",
            _hcfAmount,
            _bsdtAmount
        );
        
        return this.submitTransaction(_exchange, 0, data);
    }
    
    // ============ 管理功能 ============
    
    /**
     * @dev 添加签名者（需要多签）
     */
    function addSigner(address _signer) external onlySigner {
        require(_signer != address(0), "Invalid signer");
        require(!isSigner[_signer], "Already a signer");
        
        bytes memory data = abi.encodeWithSignature(
            "_addSigner(address)",
            _signer
        );
        
        this.submitTransaction(address(this), 0, data);
    }
    
    function _addSigner(address _signer) external {
        require(msg.sender == address(this), "Only multisig");
        
        isSigner[_signer] = true;
        signers.push(_signer);
        
        emit SignerAdded(_signer);
    }
    
    /**
     * @dev 移除签名者（需要多签）
     */
    function removeSigner(address _signer) external onlySigner {
        require(isSigner[_signer], "Not a signer");
        require(signers.length > requiredConfirmations, "Cannot remove: would break requirement");
        
        bytes memory data = abi.encodeWithSignature(
            "_removeSigner(address)",
            _signer
        );
        
        this.submitTransaction(address(this), 0, data);
    }
    
    function _removeSigner(address _signer) external {
        require(msg.sender == address(this), "Only multisig");
        
        isSigner[_signer] = false;
        
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == _signer) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }
        
        emit SignerRemoved(_signer);
    }
    
    /**
     * @dev 修改所需确认数（需要多签）
     */
    function changeRequiredConfirmations(uint256 _required) external onlySigner {
        require(_required > 0 && _required <= signers.length, "Invalid requirement");
        
        bytes memory data = abi.encodeWithSignature(
            "_changeRequiredConfirmations(uint256)",
            _required
        );
        
        this.submitTransaction(address(this), 0, data);
    }
    
    function _changeRequiredConfirmations(uint256 _required) external {
        require(msg.sender == address(this), "Only multisig");
        
        uint256 oldValue = requiredConfirmations;
        requiredConfirmations = _required;
        
        emit RequiredConfirmationsChanged(oldValue, _required);
    }
    
    // ============ 查询功能 ============
    
    function getSigners() external view returns (address[] memory) {
        return signers;
    }
    
    function getTransactionInfo(uint256 _txId) external view returns (
        address to,
        uint256 value,
        bytes memory data,
        bool executed,
        uint256 confirmations
    ) {
        Transaction storage transaction = transactions[_txId];
        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.confirmations
        );
    }
    
    function isTransactionConfirmed(uint256 _txId, address _signer) external view returns (bool) {
        return transactions[_txId].confirmed[_signer];
    }
    
    function getPendingTransactions() external view returns (uint256[] memory) {
        uint256 pendingCount = 0;
        
        // Count pending transactions
        for (uint256 i = 0; i < transactionCount; i++) {
            if (!transactions[i].executed) {
                pendingCount++;
            }
        }
        
        // Collect pending transaction IDs
        uint256[] memory pendingTxs = new uint256[](pendingCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < transactionCount; i++) {
            if (!transactions[i].executed) {
                pendingTxs[index] = i;
                index++;
            }
        }
        
        return pendingTxs;
    }
    
    // ============ 接收资金 ============
    
    receive() external payable {}
    
    fallback() external payable {}
}