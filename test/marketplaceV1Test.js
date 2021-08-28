const { ethers, upgrades } = require('hardhat');
const { expect } = require("chai");
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
    
    describe("Buying with ETH", function() {
        it("Should transfer tokens after a successful Eth buy", async function() {
            let balance = await raribleContract.balanceOf(seller.address, 65678);
            console.log(`${balance}`);
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            balance = await provider.getBalance(seller.address);
            console.log(ethers.utils.formatUnits(balance, 18));
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);
            balance = await provider.getBalance(seller.address);
            console.log(ethers.utils.formatUnits(balance, 18));
            await hardhatMarket.buyWithEther(1,{value: ethers.utils.parseEther("1.0")});
            expect(await raribleContract.balanceOf(owner.address, 65678)).to.equal(10);
        })
    });

    describe("Buying with DAI", function() {
        it("should transfer tokens after a successful dai buy", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);

            let balanceInit = await daiContract.balanceOf(buyerWithToken.address);
            console.log(`dai balance before purchase :${balanceInit} Dai`);
            await daiContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('1200.0', 18));
            await hardhatMarket.connect(buyerWithToken).buyWithDai(1);
            let balanceEnd = await daiContract.balanceOf(buyerWithToken.address);
            console.log(`dai balance after purchase :${balanceEnd} Dai`);
            console.log(`dai spent: ${balanceInit - balanceEnd}`)
            let daiprice = await hardhatMarket.getDaiPrice();
            console.log(`chainlink oracle, dai price: ${daiprice}`);
        })
    })
        
    describe("Buying with Link", function() {
        it("should transfer tokens after a successful link buy", async function() {
            await raribleContract.connect(seller).setApprovalForAll(hardhatMarket.address,true);
            await hardhatMarket.connect(seller).placeOffer(raribleAddress, 65678, 10, 1000, 120);

            balance = await linkContract.balanceOf(buyerWithToken.address);
            console.log(`link balance before purchase :${balance} Link`);
            await linkContract.connect(buyerWithToken).approve(hardhatMarket.address, ethers.utils.parseUnits('50.0', 18));
            await hardhatMarket.connect(buyerWithToken).buyWithLink(1);
            balance = await linkContract.balanceOf(buyerWithToken.address);
            console.log(`link balance after purchase :${balance} Link`);
        })
    })
    

})

