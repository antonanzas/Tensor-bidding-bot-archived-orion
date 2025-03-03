const anchor = require("@project-serum/anchor");
const web3 = require("@solana/web3.js");
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const { conn, keypair} = require("../common_c");
const { Transaction } = web3;

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });

async function delist_nft(keypair, nft){
    nft = new PublicKey(nft)
    const associatedTokenAddress = await splToken.getAssociatedTokenAddress(nft,keypair.publicKey);
    const data = await swapSdk.delist({
        owner: keypair.publicKey,
        nftMint: nft,
        nftDest: associatedTokenAddress,
    });

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
      units: 1000000 
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: 100
    });
        
    const transaction = new Transaction().add(modifyComputeUnits).add(addPriorityFee).add(...data.tx.ixs);
    // construct transaction
    const blockhash = await conn.getLatestBlockhash().then((res) => res.blockhash);
    transaction.recentBlockhash = blockhash;
    transaction.sign(keypair);
    //console.log(transaction);

     //uncomment the following fields if you want to actually execute the transaction

    const txHash = await conn.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
    preflightCommitment: "confirmed"
    });
    //console.log(transaction)
    console.log("Delisting executed with hash " + txHash);
}

module.exports = {delist_nft}