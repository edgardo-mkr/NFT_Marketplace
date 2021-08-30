const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
const balance = require('@openzeppelin/test-helpers/src/balance');
require('@openzeppelin/test-helpers/src/setup');
const { isCallTrace } = require('hardhat/internal/hardhat-network/stack-traces/message-trace');


const provider = ethers.provider;

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

const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const linkAddress = '0x514910771AF9Ca656af840dff83E8264EcF986CA'
const raribleAddress = '0xd07dc4262BCDbf85190C01c996b4C06a461d2430'

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

        //impersonating erc1155 holder
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x5a098be98f6715782ee73dc9c5b9574bd4c130c9"],
        });
        await network.provider.send("hardhat_setBalance", [
            "0x5a098be98f6715782ee73dc9c5b9574bd4c130c9",
            "0x3635c9adc5dea00000",
          ]);
        seller = await ethers.getSigner("0x5a098be98f6715782ee73dc9c5b9574bd4c130c9");

        //impersonating dai & link holder
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503"],
        });
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

    describe("Setting owner and recipient", function() {
        it("Should set the right owner", async function() {
            expect(await hardhatMarket.owner()).to.equal(owner.address);
        })

        it("Should set the right recipient", async function() {
            expect(await hardhatMarket.recipient()).to.equal(recipient.address)
        })
    })

    describe("Updating fees", function() {
        it("Should update fee", async function() {
            await hardhatMarket.updateFee(2);
            expect(await hardhatMarket.fee()).to.equal(2)
        })
        it("Should not allowed the update if msg.sender is not owner", async function() {
            await expect(hardhatMarket.connect(addr1).updateFee(50)).to.be.revertedWith("Ownable: caller is not the owner");
        })
    })

    describe("Changing the recipient account", function() {
        it("Should change the recipient to the ew account", async function() {
            await hardhatMarket.updateRecipient(addr1.address);
            expect(await hardhatMarket.recipient()).to.equal(addr1.address)
        })
        it("Should not allowed the change if msg.sender is not owner", async function() {
            await expect(hardhatMarket.connect(addr1).updateRecipient(addr1.address)).to.be.revertedWith("Ownable: caller is not the owner")
        })
    })
    
    describe("Buying with ETH", function() {
        it("Should transfer tokens after a successful Eth buy", async function() {
            
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);
            
            let sellerBalance = await provider.getBalance(seller.address);

            let priceInEth = await hardhatMarket.getEthPrice(); 
            let num = BigInt(1000) * BigInt(10**8) * BigInt(10**18);
            priceInEth = num / BigInt(priceInEth); 

            const recipientTracker = await balance.tracker(recipient.address);
            let buyerTracker = await balance.tracker(owner.address);
            await hardhatMarket.buyWithEther(1,{value: ethers.utils.parseEther("1.0")});
            const { delta, fees } = await buyerTracker.deltaWithFees();
            
            expect(await raribleContract.balanceOf(owner.address, 65678)).to.equal(10);
            expect(await provider.getBalance(seller.address)).to.equal(BigInt(sellerBalance) + (priceInEth - (priceInEth/BigInt(100))));
            expect(await recipientTracker.delta()).to.be.bignumber.equal((priceInEth/BigInt(100)).toString());
            expect(delta).to.be.bignumber.equal( "-" + (BigInt(priceInEth) + BigInt(fees)).toString())
        })
    });

    describe("Buying with DAI", function() {
        it("should transfer tokens after a successful dai buy", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);

            
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

    describe("Cancell an offer", function() {
        it("Should cancell an offer", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await hardhatMarket.connect(seller).cancellOffer(1);
            let firstOffer = await hardhatMarket.offers(1)
            expect(firstOffer.onSale).to.equal(false)
        })

        it("Should not allowed an user to cancell other users offers", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await expect(hardhatMarket.cancellOffer(1)).to.be.revertedWith("You are not the creator of this offer");

        })

        it("Should not allowed to cancel an invalid ID offer", async function() {
            await expect(hardhatMarket.cancellOffer(1)).to.be.revertedWith("Offer id does not exist")
        })
    })

    describe("Attempting to buy without sending or aproving enough tokens", function() {
        it("Not sending enough ETH", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await expect(hardhatMarket.buyWithEther(1,{value: ethers.utils.parseEther("1.0")})).to.be.revertedWith('Not enough ether sent')
        })
        it("Not approving enough DAI token", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

            await daiContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('1000.0', 18))
            await expect(hardhatMarket.connect(buyerWithToken).buyWithDai(1)).to.be.revertedWith('Not enough allowance to buy the tokens')
        })
        it("Not approving enough LINK token", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 96436, 10, 20000, 120);

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

    
    

})

