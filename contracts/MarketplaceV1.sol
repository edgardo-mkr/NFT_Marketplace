// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";


contract MarketplaceV1 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable{
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

    mapping(uint => Offer) public offers;
    uint public offerCount;

    IERC20Upgradeable daiToken;
    IERC20Upgradeable linkToken;

    AggregatorV3Interface internal ethPriceFeed;
    AggregatorV3Interface internal daiPriceFeed;
    AggregatorV3Interface internal linkPriceFeed;

    function initialize(address _recipient) public initializer {
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

    function placeOffer(address _tokenAdress, uint _tokenId, uint _amount, uint _usdPrice, uint32 _deadline) public payable{
        IERC1155 tokenContract = IERC1155(_tokenAdress);
        require(tokenContract.isApprovedForAll(msg.sender, address(this)), "Approval is required to spend the tokens to be offered");
        offerCount++;
        offers[offerCount] = Offer(msg.sender,_tokenAdress, _tokenId, _amount, _usdPrice * (10**8),uint32(block.timestamp + _deadline), true);
    }

    function cancellOffer(uint _id) public {
        require(_id <= offerCount, "Offer id does not exist");
        require(offers[_id].owner == msg.sender, "You are not the creator of this offer");
        offers[_id].onSale = false;
    }

    function buyWithEther(uint _id) external payable nonReentrant{
        require(_id <= offerCount, "Offer id does not exist");

        Offer storage offerInfo = offers[_id];

        require(offerInfo.owner != msg.sender, "The seller can't be the buyer aswell");
        require(offerInfo.onSale, "This offer has been cancelled");
        require(block.timestamp <= offerInfo.deadline, "The deadline has been reached");

        IERC1155 tokenContract = IERC1155(offerInfo.tokenAdress);
        require(tokenContract.isApprovedForAll(offerInfo.owner, address(this)), "The seller has remove aproval to spend the tokens");

        require(msg.value > 0, "You have not sent any ether");
        uint price = offerInfo.usdPrice * (10**18) / uint(getEthPrice());
        require(price <= msg.value, "Not enough ether sent");
        tokenContract.safeTransferFrom(offerInfo.owner,msg.sender,offerInfo.tokenId,offerInfo.amount, "");
        payable(offerInfo.owner).call{value: price - (price * fee / 100)}("");
        offerInfo.onSale = false;
        payable(recipient).call{value: (price * fee) / 100}("");
        
        if(msg.value > price){
            payable(msg.sender).call{value: msg.value - price}("");
        }
        
    }

    function buyWithDai(uint _id) external payable nonReentrant{
        require(_id <= offerCount, "Offer id does not exist");

        Offer storage offerInfo = offers[_id];

        require(offerInfo.owner != msg.sender, "The seller can't be the buyer aswell");
        require(offerInfo.onSale, "This offer has been cancelled");
        require(block.timestamp <= offerInfo.deadline, "The deadline has been reached");

        IERC1155 tokenContract = IERC1155(offerInfo.tokenAdress);
        require(tokenContract.isApprovedForAll(offerInfo.owner, address(this)), "The seller has remove aproval to spend the tokens");
        
        uint price = uint(int(offerInfo.usdPrice) * (10**18) / getDaiPrice());
        require(daiToken.allowance(msg.sender, address(this)) >= price, "Not enough allowance to buy the tokens");
        

        tokenContract.safeTransferFrom(offerInfo.owner, msg.sender, offerInfo.tokenId, offerInfo.amount, "");
        daiToken.transferFrom(msg.sender, offerInfo.owner, price - (price * fee / 100));
        offerInfo.onSale = false;
        daiToken.transferFrom(msg.sender, recipient, price * fee / 100);
    }
    
    function buyWithLink(uint _id) external payable nonReentrant{
        require(_id <= offerCount, "Offer id does not exist");

        Offer storage offerInfo = offers[_id];

        require(offerInfo.owner != msg.sender, "The seller can't be the buyer aswell");
        require(offerInfo.onSale, "This offer has been cancelled");
        require(block.timestamp <= offerInfo.deadline, "The deadline has been reached");

        IERC1155 tokenContract = IERC1155(offerInfo.tokenAdress);
        require(tokenContract.isApprovedForAll(offerInfo.owner, address(this)), "The seller has remove aproval to spend the tokens");

        uint price = uint(int(offerInfo.usdPrice) * (10**18) / getLinkPrice());
        require(linkToken.allowance(msg.sender, address(this)) >= price, "Not enough allowance to buy the tokens");
        

        tokenContract.safeTransferFrom(offerInfo.owner, msg.sender, offerInfo.tokenId, offerInfo.amount, "");
        linkToken.transferFrom(msg.sender, offerInfo.owner, price - (price * fee / 100));
        offerInfo.onSale = false;
        linkToken.transferFrom(msg.sender, recipient, price * fee / 100);
    }


    function getEthPrice() public view returns (int) {
        (,int price,,,) = ethPriceFeed.latestRoundData();
        return price;
    }

    function getDaiPrice() public view returns (int) {
        (,int price,,,) = daiPriceFeed.latestRoundData();
        return price;
    }

    function getLinkPrice() public view returns (int) {
        (,int price,,,) = linkPriceFeed.latestRoundData();
        return price;
    }



}