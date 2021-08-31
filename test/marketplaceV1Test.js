const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
//requirements for test-helper openzeppelin plugin 
const { BN } = require("@openzeppelin/test-helpers/src/setup");
const balance = require('@openzeppelin/test-helpers/src/balance');
const time = require("@openzeppelin/test-helpers/src/time");
require('@openzeppelin/test-helpers/src/setup');

const { isCallTrace } = require('hardhat/internal/hardhat-network/stack-traces/message-trace');

const TOLERANCE_SECONDS = new BN(1);

//getting alchemy provider
const provider = ethers.provider;

//interface abi for balaNceOf and approve functions in ERC-20 tokens
const erc20Abi = [
    {
        "constant": true,
        "inputs": [
            {
                "name": "_owner",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "name": "balance",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {
                "name": "_spender",
                "type": "address"
            },
            {
                "name": "_value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "name": "",
                "type": "bool"
            }
        ],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

//interface abi for balanceOf and setApprovalForAll functions in ERC-1155 tokens
const erc1155Abi = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "id",
				"type": "uint256"
			}
		],
		"name": "balanceOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "operator",
				"type": "address"
			},
			{
				"internalType": "bool",
				"name": "approved",
				"type": "bool"
			}
		],
		"name": "setApprovalForAll",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]

//dai & link token contract address in mainnet
const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const linkAddress = '0x514910771AF9Ca656af840dff83E8264EcF986CA'

//rarible ERC-1155 token contract address
const raribleAddress = '0xd07dc4262BCDbf85190C01c996b4C06a461d2430'

//Initiating dai, link and rarible instances 
const daiContract = new ethers.Contract(daiAddress, erc20Abi, provider);
const linkContract = new ethers.Contract(linkAddress, erc20Abi, provider);
const raribleContract = new ethers.Contract(raribleAddress, erc1155Abi, provider);



const hre = require("hardhat");

describe("MarketplaceV1 contract", function (){
    
    let Market;
    let hardhatMarket;
    let seller;
    let buyerWithToken;
    let owner;
    let recipient;
    let addr1;
    let addrs;

    beforeEach(async function (){

        //impersonating ERC-1155 holder
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x5a098be98f6715782ee73dc9c5b9574bd4c130c9"],
        });
        //setting his balance to 1000 ETH
        await network.provider.send("hardhat_setBalance", [
            "0x5a098be98f6715782ee73dc9c5b9574bd4c130c9",
            "0x3635c9adc5dea00000",
          ]);
        seller = await ethers.getSigner("0x5a098be98f6715782ee73dc9c5b9574bd4c130c9");

        //impersonating Dai & Link token holder
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503"],
        });
        //setting his balance to 1000 ETH 
        await network.provider.send("hardhat_setBalance", [
            "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
            "0x3635c9adc5dea00000",
          ]);
        buyerWithToken = await ethers.getSigner("0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503");
        
        //deploying proxy
        Market = await ethers.getContractFactory("MarketplaceV1");
        [owner, recipient, addr1, ...addrs] = await ethers.getSigners();
        hardhatMarket = await upgrades.deployProxy(Market, [recipient.address]);
    });

    //testing correct initiation 
    describe("Setting owner and recipient", function() {
        it("Should set the right owner", async function() {
            expect(await hardhatMarket.owner()).to.equal(owner.address);
        })

        it("Should set the right recipient", async function() {
            expect(await hardhatMarket.recipient()).to.equal(recipient.address)
        })
    })

    //only owner should update the fee
    describe("Updating fees", function() {
        it("Should update fee", async function() {
            await hardhatMarket.updateFee(2);
            expect(await hardhatMarket.fee()).to.equal(2)
        })
        it("Should not allowed the update if msg.sender is not owner", async function() {
            await expect(hardhatMarket.connect(addr1).updateFee(50)).to.be.revertedWith("Ownable: caller is not the owner");
        })
    })

    //only owner should update the recipient address
    describe("Changing the recipient account", function() {
        it("Should change the recipient to the new account", async function() {
            await hardhatMarket.updateRecipient(addr1.address);
            expect(await hardhatMarket.recipient()).to.equal(addr1.address)
        })
        it("Should not allowed the change if msg.sender is not owner", async function() {
            await expect(hardhatMarket.connect(addr1).updateRecipient(addr1.address)).to.be.revertedWith("Ownable: caller is not the owner")
        })
    })

    
    describe("Placing an offer", function() {
        it("Should revert for not approving contract to spend tokens", async function() {
            await expect(hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120))
            .to.be.revertedWith("Approval is required to spend the tokens to be offered")
        })
        it("Should revert for offering more token than the seller current balance", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            //seller current balance is 30 tokens of the id: 65678
            await expect(hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 40, 1000, 120))
            .to.be.revertedWith("Seller balance insufficient to place the offer");
        })
        it("Should succesfully place an offer", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);

            //getting the block.timestamp from the last tx with time test-helper
            const now = await time.latest();
            let placedOffer = await hardhatMarket.offers(1);

            expect(placedOffer.owner).to.equal(seller.address)
            expect(placedOffer.tokenAdress).to.equal(raribleAddress)
            expect(placedOffer.tokenId).to.equal(65678)
            expect(placedOffer.amount).to.equal(10)
            expect(placedOffer.usdPrice).to.equal(1000 * (10**8)) //it is multiplied by 10^8 because the chainlink return value has 8 decimals
            expect(placedOffer.deadline.toString()).to.be.bignumber.closeTo((BigInt(now) + BigInt(120)).toString(), TOLERANCE_SECONDS)
            expect(placedOffer.onSale).to.equal(true)
        })
    })
    
    describe("Buying with ETH", function() {
        it("Should transfer tokens after a successful Eth buy", async function() {
            
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);
            
            let sellerBalance = await provider.getBalance(seller.address);

            //getting price of the tokens in ETH, is cast to BigInt for easier use on the matchers
            let priceInEth = await hardhatMarket.getEthPrice(); 
            let num = BigInt(1000) * BigInt(10**8) * BigInt(10**18);
            priceInEth = num / BigInt(priceInEth); 

            //using test-helpers to keep track of the buyer and recipient balances
            const recipientTracker = await balance.tracker(recipient.address);
            let buyerTracker = await balance.tracker(owner.address);

            await hardhatMarket.buyWithEther(1,{value: ethers.utils.parseEther("1.0")});

            //getting the change on the buyer balance with fees included
            const { delta, fees } = await buyerTracker.deltaWithFees();
            
            expect(await raribleContract.balanceOf(owner.address, 65678)).to.equal(10);//checking the succesful transfer of the tokens
            expect(await provider.getBalance(seller.address)).to.equal(BigInt(sellerBalance) + (priceInEth - (priceInEth/BigInt(100))));//checking the transfer of money to the seller
            expect(await recipientTracker.delta()).to.be.bignumber.equal((priceInEth/BigInt(100)).toString());//checking the transfer of the fees to the recipient 
            //checking the correct refund of ETH to the buyer for sending more than the sale price
            //the "-" is to indicate that is a decrement in the balance 
            expect(delta).to.be.bignumber.equal( "-" + (priceInEth + BigInt(fees)).toString())
        })
    });

    describe("Buying with DAI", function() {
        it("should transfer tokens after a successful dai buy", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);

            //in this case the buyer does not send the tokens, just approve the contract to spend them
            //so there's no necessity for checking at the end for the refund of the tokens
            //the contract spends just the right amount needed for the sale
            await daiContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('1200.0', 18));

            let sellerDai = await daiContract.balanceOf(seller.address)
            let recipientDai = await daiContract.balanceOf(recipient.address);

            await hardhatMarket.connect(buyerWithToken).buyWithDai(1);
            
            let priceInDai = await hardhatMarket.getDaiPrice();
            let num = BigInt(1000) * BigInt(10**8) * BigInt(10**18);
            priceInDai = num / BigInt(priceInDai)
            
            expect(await raribleContract.balanceOf(buyerWithToken.address, 65678)).to.equal(10);
            expect(await daiContract.balanceOf(seller.address)).to.equal(BigInt(sellerDai) + (priceInDai - (priceInDai/BigInt(100))))
            expect(await daiContract.balanceOf(recipient.address)).to.equal(BigInt(recipientDai) + (priceInDai/BigInt(100)))
        })
    })
        
    describe("Buying with Link", function() {
        it("should transfer tokens after a successful link buy", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);

            //same as with Dai
            await linkContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('50.0', 18));

            let sellerLink = await linkContract.balanceOf(seller.address)
            let recipientLink = await linkContract.balanceOf(recipient.address)
            await hardhatMarket.connect(buyerWithToken).buyWithLink(1);
            
            let priceInLink = await hardhatMarket.getLinkPrice();
            let num = BigInt(1000) * BigInt(10**8) * BigInt(10**18);
            priceInLink = num / BigInt(priceInLink)

            expect(await raribleContract.balanceOf(buyerWithToken.address, 65678)).to.equal(20);
            expect(await linkContract.balanceOf(seller.address)).to.equal(BigInt(sellerLink) + (priceInLink - (priceInLink/BigInt(100))))
            expect(await linkContract.balanceOf(recipient.address)).to.equal(BigInt(recipientLink) + (priceInLink/BigInt(100)))
        })
    })

    describe("same user placing multiple offers", function() {
        it("Should allow an user to place more than one offer and buy it with ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);

            await hardhatMarket.buyWithEther(1,{value: ethers.utils.parseEther("2.0")});
            await hardhatMarket.buyWithEther(2,{value: ethers.utils.parseEther("2.0")});
            await hardhatMarket.buyWithEther(3,{value: ethers.utils.parseEther("2.0")});

            expect(await raribleContract.balanceOf(owner.address, 96436)).to.equal(6)
        })
        it("Should allow an user to place more than one offer and buy it with DAI", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);

            await daiContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('16000.0', 18));
            await hardhatMarket.connect(buyerWithToken).buyWithDai(1);
            await hardhatMarket.connect(buyerWithToken).buyWithDai(2);
            await hardhatMarket.connect(buyerWithToken).buyWithDai(3);

            expect(await raribleContract.balanceOf(buyerWithToken.address, 96436)).to.equal(6)
        })
        it("Should allow an user to place more than one offer and buy it with LINK", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 2, 5000, 120);

            await linkContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('700.0', 18));
            await hardhatMarket.connect(buyerWithToken).buyWithLink(1);
            await hardhatMarket.connect(buyerWithToken).buyWithLink(2);
            await hardhatMarket.connect(buyerWithToken).buyWithLink(3);

            expect(await raribleContract.balanceOf(buyerWithToken.address, 96436)).to.equal(12)
        })
    })

    describe("Cancell an offer", function() {
        it("Should cancell an offer", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await hardhatMarket.connect(seller).cancellOffer(1);
            let firstOffer = await hardhatMarket.offers(1)
            expect(firstOffer.onSale).to.equal(false)
        })
        it("Should not allowed an user to cancell other user's offers", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            //attempting to cancell with the default account (owner)
            await expect(hardhatMarket.cancellOffer(1)).to.be.revertedWith("You are not the creator of this offer");

        })
        it("Should not allowed to cancel an invalid ID offer", async function() {
            await expect(hardhatMarket.cancellOffer(1)).to.be.revertedWith("Offer id does not exist")
        })
    })

    describe("Seller removes approval after placing an offer", function() {
        it("Should revert when client buy with ether", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,false);

            await expect(hardhatMarket.buyWithEther(1, {value: ethers.utils.parseEther("7.0")}))
            .to.be.revertedWith("The seller has remove aproval to spend the tokens");
        })
        it("Should revert when client buy with dai", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,false);


            await expect(hardhatMarket.connect(buyerWithToken).buyWithDai(1))
            .to.be.revertedWith("The seller has remove aproval to spend the tokens");
        })
        it("Should revert when client buy with link", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,false);

            await expect(hardhatMarket.connect(buyerWithToken).buyWithLink(1))
            .to.be.revertedWith("The seller has remove aproval to spend the tokens");
        })

        
    })

    describe("Attempting to buy without sending or aproving enough tokens", function() {
        it("Not sending enough ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            //the price of ETH is just above 3000$ and the offer is 20000$
            await expect(hardhatMarket.buyWithEther(1,{value: ethers.utils.parseEther("1.0")})).to.be.revertedWith('Not enough ether sent')
        })
        it("Not approving enough DAI token", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            //dai price is aprox. 1$ and we're only sending 1000
            await daiContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('1000.0', 18))
            await expect(hardhatMarket.connect(buyerWithToken).buyWithDai(1)).to.be.revertedWith('Not enough allowance to buy the tokens')
        })
        it("Not approving enough LINK token", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            //link price is aprox. 25$ at date of testing and we're only sending 100, for a total 2500$ 
            await linkContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('100.0', 18))
            await expect(hardhatMarket.connect(buyerWithToken).buyWithLink(1)).to.be.revertedWith('Not enough allowance to buy the tokens')
        })
    })
    
    describe("Attempting to buy with an invalid ID offer", function() {
        it("Attemp with ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await expect(hardhatMarket.buyWithEther(2,{value: ethers.utils.parseEther("7.0")})).to.be.revertedWith('Offer id does not exist')
        })
        it("Attemp with DAI", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await daiContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('21000.0', 18))
            await expect(hardhatMarket.connect(buyerWithToken).buyWithDai(2)).to.be.revertedWith('Offer id does not exist')
        })
        it("Attemp with LINK", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await linkContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('1000.0', 18))
            await expect(hardhatMarket.connect(buyerWithToken).buyWithLink(2)).to.be.revertedWith('Offer id does not exist')
        })
    })

    describe("Seller attempting to buy its own tokens", function() {
        it("Should revert while buying with ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await expect(hardhatMarket.connect(seller).buyWithEther(1, {value: ethers.utils.parseEther("7.0")}))
            .to.be.revertedWith("The seller can't be the buyer aswell")
        })
        it("Should revert while buying with DAI", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await expect(hardhatMarket.connect(seller).buyWithDai(1))
            .to.be.revertedWith("The seller can't be the buyer aswell")
        })
        it("Should revert while buying with LINK", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await expect(hardhatMarket.connect(seller).buyWithLink(1))
            .to.be.revertedWith("The seller can't be the buyer aswell")
        })
    })

    describe("Attemp to buy a cancelled offer", function() {
        it("Should revert while buying with ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await hardhatMarket.connect(seller).cancellOffer(1);

            await expect(hardhatMarket.buyWithEther(1, {value: ethers.utils.parseEther("7.0")})).to.be.revertedWith("This offer has been cancelled")
        })
        it("Should revert while buying with DAI", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await hardhatMarket.connect(seller).cancellOffer(1);

            await expect(hardhatMarket.connect(buyerWithToken).buyWithDai(1)).to.be.revertedWith("This offer has been cancelled")
        })
        it("Should revert while buying with LINK", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await hardhatMarket.connect(seller).cancellOffer(1);

            await expect(hardhatMarket.connect(buyerWithToken).buyWithLink(1)).to.be.revertedWith("This offer has been cancelled")
        })
    })

    describe("Buying tokens after deadline", function() {
        it("Should revert while buying with ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 5);

            //deadline was set to 5 seconds for terms of testing
            //using time test-helper we wait for 6 seconds and check the revert
            await time.increase(time.duration.seconds(6));

            await expect(hardhatMarket.buyWithEther(1, {value: ethers.utils.parseEther("7.0")})).to.be.revertedWith("The deadline has been reached");
        })
        it("Should revert while buying with DAI", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 5);

            await time.increase(time.duration.seconds(6));

            await expect(hardhatMarket.connect(buyerWithToken).buyWithDai(1)).to.be.revertedWith("The deadline has been reached");
        })
        it("Should revert while buying with LINK", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 5);

            await time.increase(time.duration.seconds(6));

            await expect(hardhatMarket.connect(buyerWithToken).buyWithLink(1)).to.be.revertedWith("The deadline has been reached");
        })
    })

    describe("Events", function() {
        it("Should emit placingOffer event", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);

            await expect(hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 5))
            .to.emit(hardhatMarket, "placingOffer")
            .withArgs(seller.address, raribleAddress, 96436, 10, 20000, 5, true)
        })
        it("Should emit cancellingOffer event", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 5);

            await expect(hardhatMarket.connect(seller).cancellOffer(1))
            .to.emit(hardhatMarket, "cancellingOffer")
            .withArgs(seller.address, 1)
        })
        it("Should emit purchase event while buying with ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 5, 7500, 5);

            await expect(hardhatMarket.buyWithEther(1, {value: ethers.utils.parseEther("3.0")}))
            .to.emit(hardhatMarket, "purchase")//passing the proxy contract and teh name of the event
            .withArgs(owner.address, 1, "ETH")//passing the arguments that should return from the event
        })
        it("Should emit purchase event while buying with DAI", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 5, 7500, 5);

            await daiContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('8000.0', 18));
            await expect(hardhatMarket.connect(buyerWithToken).buyWithDai(1))
            .to.emit(hardhatMarket, "purchase")
            .withArgs(buyerWithToken.address, 1, "DAI")
        })
        it("Should emit purchase event while buying with LINK", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 5, 7500, 5);

            await linkContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('400.0', 18))
            await expect(hardhatMarket.connect(buyerWithToken).buyWithLink(1))
            .to.emit(hardhatMarket, "purchase")
            .withArgs(buyerWithToken.address, 1, "LINK")
        })
    })
    

})

