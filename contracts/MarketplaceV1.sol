// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/// @title Marketplace fo ERC-1155 tokens
/// @author Edgardo González
/// @notice This contract allows user to place or cancell their offers and buy other people ERC-1155 tokens 
/// @dev the seller or buyer(if buying with Dai or Link tokens) MUST first approve the contract to spend their token 
contract MarketplaceV1 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable{
    /**  
        @dev the recipient is the receiver address of the fees charge on each sale
        @dev the struct variable is used to help storage all the pertinent details of the offer
    */
    address public recipient;
    uint public fee;
    struct Offer {
        address owner;
        address tokenAdress;
        uint tokenId;
        uint amount;
        uint usdPrice;
        uint32 deadline;
        bool onSale;
    }

    /**   
        @dev offers keeps track of all the offers made or cancelled
        @dev offerCount is used to create unique id's for each sale
    */
    mapping(uint => Offer) public offers;
    uint public offerCount;

    /// @dev interfaces declarations for the dai and link contract to check approvals and transfers
    IERC20Upgradeable daiToken;
    IERC20Upgradeable linkToken;

    /// @dev interfaces declarations for the chainlink aggregators to query off-chain pricefeeds
    AggregatorV3Interface internal ethPriceFeed;
    AggregatorV3Interface internal daiPriceFeed;
    AggregatorV3Interface internal linkPriceFeed;

    //events
    event placingOffer(
        address indexed _creator, 
        address indexed _tokenAdress, 
        uint indexed _tokenId,
        uint _amountOfTokens, 
        uint _priceinUsd, 
        uint32 _deadline,
        bool _onSale
    );
    event cancellingOffer(
        address indexed _creator,
        uint indexed _offerId
    );
    event purchase(
        address indexed _buyer,
        uint indexed _offerId, 
        string indexed _paymentMethod
    );

    /// @dev not forgetting to initialize the "Intialize" functions on all the parent contracts to be upgradable complaint 
    function initialize(address _recipient) public initializer {
        OwnableUpgradeable.__Ownable_init();
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init();

        recipient = _recipient;
        fee = 1;
        daiToken = IERC20Upgradeable(0x6B175474E89094C44Da98b954EedeAC495271d0F);
        linkToken = IERC20Upgradeable(0x514910771AF9Ca656af840dff83E8264EcF986CA);

        ethPriceFeed = AggregatorV3Interface(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
        daiPriceFeed = AggregatorV3Interface(0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9);
        linkPriceFeed = AggregatorV3Interface(0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c);

    }


    function updateFee(uint _newFee) public onlyOwner{
        fee = _newFee;
    }

    function updateRecipient(address _newRecipient) public onlyOwner{
        recipient = _newRecipient;
    }

    /// @notice uploads an offer to the contract
    /// @param _tokenAdress is the address of the ERC-1155 contract of which the tokens come from
    /// @param _tokenId is the respective ID of the token  
    /// @param _amount is the number of tokens desired to sell 
    /// @param _usdPrice is the price in Usd for the whole amount of tokens
    /// @param _deadline is the time limit that this offer will be active, expressed in seconds
    /// @dev seller MUST first approve the contract to spend their token
    /// @dev _usdPrice is multiply by 10^8 because the return value of the chainlink has 8 decimals places  
    function placeOffer(address _tokenAdress, uint _tokenId, uint _amount, uint _usdPrice, uint32 _deadline) public payable{
        IERC1155 tokenContract = IERC1155(_tokenAdress);
        require(tokenContract.isApprovedForAll(msg.sender, address(this)), "Approval is required to spend the tokens to be offered");
        require(tokenContract.balanceOf(msg.sender, _tokenId) >= _amount, "Seller balance insufficient to place the offer");
        offerCount++;
        offers[offerCount] = Offer(msg.sender,_tokenAdress, _tokenId, _amount, _usdPrice * (10**8),uint32(block.timestamp + _deadline), true);

        emit placingOffer(msg.sender,_tokenAdress, _tokenId, _amount, _usdPrice, _deadline, true);
    }

    /// @param _id is the offer ID
    /// @dev you must be the creator of the offer to cancell it 
    function cancellOffer(uint _id) public {
        require(_id <= offerCount, "Offer id does not exist");
        require(offers[_id].owner == msg.sender, "You are not the creator of this offer");
        offers[_id].onSale = false;

        emit cancellingOffer(msg.sender, _id);
    }

    /// @notice purchase an offer tokens with ETH as payment method
    /// @param _id is the offer ID 
    /// @dev if buyer sends more ether than the neccesary for the sale, they are return to the buyer
    /// @dev chainlik oracle is used for the price calculation 
    function buyWithEther(uint _id) external payable nonReentrant{
        require(_id <= offerCount, "Offer id does not exist");

        Offer storage offerInfo = offers[_id];

        require(offerInfo.owner != msg.sender, "The seller can't be the buyer aswell");
        require(block.timestamp <= offerInfo.deadline, "The deadline has been reached");
        require(offerInfo.onSale, "This offer has been cancelled");
        

        IERC1155 tokenContract = IERC1155(offerInfo.tokenAdress);
        require(tokenContract.isApprovedForAll(offerInfo.owner, address(this)), "The seller has remove aproval to spend the tokens");

        require(msg.value > 0, "You have not sent any ether");
        uint price = offerInfo.usdPrice * (10**18) / uint(getEthPrice());
        require(price <= msg.value, "Not enough ether sent");
        tokenContract.safeTransferFrom(offerInfo.owner,msg.sender,offerInfo.tokenId,offerInfo.amount, "");
        (bool sent1,) = payable(offerInfo.owner).call{value: price - (price * fee / 100)}("");
        require(sent1, "Failed to send ether to seller");
        offerInfo.onSale = false;
        (bool sent2,) = payable(recipient).call{value: (price * fee) / 100}("");
        require(sent2, "Failed to send ether to fee recipient");

        if(msg.value > price){
            (bool sent3,) = payable(msg.sender).call{value: msg.value - price}("");
            require(sent3, "Failed to refund leftover ether from tx to buyer");
        }

        emit purchase(msg.sender, _id, "ETH");
        
    }

    /// @notice purchase an offer tokens with DAI as payment method
    /// @param _id is the offer ID
    /// @dev the buyer MUST approve the contract to spend their token for the right amount for the sale (using chainlink oracle)
    function buyWithDai(uint _id) external payable nonReentrant{
        require(_id <= offerCount, "Offer id does not exist");

        Offer storage offerInfo = offers[_id];

        require(offerInfo.owner != msg.sender, "The seller can't be the buyer aswell");
        require(block.timestamp <= offerInfo.deadline, "The deadline has been reached");
        require(offerInfo.onSale, "This offer has been cancelled");
        

        IERC1155 tokenContract = IERC1155(offerInfo.tokenAdress);
        require(tokenContract.isApprovedForAll(offerInfo.owner, address(this)), "The seller has remove aproval to spend the tokens");
        
        uint price = uint(int(offerInfo.usdPrice) * (10**18) / getDaiPrice());
        require(daiToken.allowance(msg.sender, address(this)) >= price, "Not enough allowance to buy the tokens");
        

        tokenContract.safeTransferFrom(offerInfo.owner, msg.sender, offerInfo.tokenId, offerInfo.amount, "");
        daiToken.transferFrom(msg.sender, offerInfo.owner, price - (price * fee / 100));
        offerInfo.onSale = false;
        daiToken.transferFrom(msg.sender, recipient, price * fee / 100);

        emit purchase(msg.sender, _id, "DAI");
    }
    
    /// @notice purchase an offer tokens with LINK as payment method
    /// @param _id is the offer ID
    /// @dev the buyer MUST approve the contract to spend their token for the right amount for the sale (using chainlink oracle)
    function buyWithLink(uint _id) external payable nonReentrant{
        require(_id <= offerCount, "Offer id does not exist");

        Offer storage offerInfo = offers[_id];

        require(offerInfo.owner != msg.sender, "The seller can't be the buyer aswell");
        require(block.timestamp <= offerInfo.deadline, "The deadline has been reached");
        require(offerInfo.onSale, "This offer has been cancelled");
        

        IERC1155 tokenContract = IERC1155(offerInfo.tokenAdress);
        require(tokenContract.isApprovedForAll(offerInfo.owner, address(this)), "The seller has remove aproval to spend the tokens");

        uint price = uint(int(offerInfo.usdPrice) * (10**18) / getLinkPrice());
        require(linkToken.allowance(msg.sender, address(this)) >= price, "Not enough allowance to buy the tokens");
        

        tokenContract.safeTransferFrom(offerInfo.owner, msg.sender, offerInfo.tokenId, offerInfo.amount, "");
        linkToken.transferFrom(msg.sender, offerInfo.owner, price - (price * fee / 100));
        offerInfo.onSale = false;
        linkToken.transferFrom(msg.sender, recipient, price * fee / 100);

        emit purchase(msg.sender, _id, "LINK");
    }

    /// @notice get ether price in Usd
    /// @return price in Usd as an int with 8 decimals 
    function getEthPrice() public view returns (int) {
        (,int price,,,) = ethPriceFeed.latestRoundData();
        return price;
    }

    /// @notice get dai price in Usd
    /// @return price in Usd as an int with 8 decimals 
    function getDaiPrice() public view returns (int) {
        (,int price,,,) = daiPriceFeed.latestRoundData();
        return price;
    }

    /// @notice get link price in Usd
    /// @return price in Usd as an int with 8 decimals 
    function getLinkPrice() public view returns (int) {
        (,int price,,,) = linkPriceFeed.latestRoundData();
        return price;
    }



}