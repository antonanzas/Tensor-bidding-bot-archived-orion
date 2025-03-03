const splToken = require("@solana/spl-token");
const web3 = require("@solana/web3.js");
const { TensorWhitelistSDK, findWhitelistPDA } = require("@tensor-oss/tensorswap-sdk");
const { decode } = require('bs58');


const helius =  ""
const quicknode =  ""

const conn = new web3.Connection(helius,{commitment: "confirmed"});


var privKey = "";
const keypair = web3.Keypair.fromSecretKey(decode(privKey));

module.exports = {conn,keypair}
