pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract MarketplaceV1 is Initializable, Ownable{
    address public recipient;
    uint public fee;
    struct Offer {
        address tokenAdress;
        uint tokenId;
        uint amount;
        uint32 deadline;
        uint32 usdPrice;
        bool onSale;
    }

    Offer[] public offers;

    mapping (uint => address) public offerToOwner;

    AggregatorV3Interface internal ethPriceFeed;
    AggregatorV3Interface internal daiPriceFeed;
    AggregatorV3Interface internal linkPriceFeed;

    function initialize(address _recipient) public initializer {
        recipient = _recipient;
        fee = 1;
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

    function placeOffer(address _tokenAdress, uint _tokenId, uint _amount, uint32 _deadline, uint32 _usdPrice) public payable{
        IERC1155 tokenContract = IERC1155(_tokenAdress);
        require(tokenContract.isApprovedForAll(msg.sender, this.address), "Approval is required to spend the tokens to be offered");
        uint id = offers.push(Offer(_tokenAdress, _tokenId, _amount, block.timestamp + _deadline, _usdPrice, true)) - 1;
        offerToOwner[id] = msg.sender;
    }

    function cancellOffer(uint _id) public {
        require(_id < offers.length, "Offer id does not exist");
        require(offerToOwner[_id] == msg.sender, "You are not the creator of this offer");
        offers[_id].onSale = false;
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